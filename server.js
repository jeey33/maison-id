const express = require("express");
const path = require("path");
const { Pool } = require("pg");
const crypto = require("crypto"); // Module de cryptographie pour le coffre-fort

// --- NOUVEAUX IMPORTS POUR LE PAIEMENT ---
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY || 'sk_test_TA_CLE_SECRETE_STRIPE');
const { v4: uuidv4 } = require("uuid"); 

const app = express();
const PORT = process.env.PORT || 3000;

// --- CONFIGURATION POSTGRESQL (DÉCLARÉE EN PREMIER) ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgres://localhost:5432/homeid",
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

app.use(express.json({ limit: '50mb' }));

// --- SÉCURITÉ COFFRE FORT (AES-256) ---
const ENCRYPTION_KEY = crypto.createHash('sha256').update(process.env.VAULT_SECRET || "home-id-ultra-secure-key-2026").digest('base64').substring(0, 32);
const IV_LENGTH = 16;

function encryptPassword(text) {
  let iv = crypto.randomBytes(IV_LENGTH);
  let cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decryptPassword(text) {
  let textParts = text.split(':');
  let iv = Buffer.from(textParts.shift(), 'hex');
  let encryptedText = Buffer.from(textParts.join(':'), 'hex');
  let decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

// --- INITIALISATION DES TABLES BASE DE DONNÉES ---
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS home (id VARCHAR(50) PRIMARY KEY, name VARCHAR(100), year INT, surface INT, land INT, owner_password VARCHAR(255), is_setup BOOLEAN DEFAULT FALSE);
      CREATE TABLE IF NOT EXISTS systems (id VARCHAR(50) PRIMARY KEY, home_id VARCHAR(50) REFERENCES home(id) ON DELETE CASCADE, name VARCHAR(100), icon VARCHAR(10), status VARCHAR(50), color VARCHAR(20));
      CREATE TABLE IF NOT EXISTS equipment (id VARCHAR(50) PRIMARY KEY, system_id VARCHAR(50) REFERENCES systems(id) ON DELETE CASCADE, name VARCHAR(100), model VARCHAR(100), installed VARCHAR(50), notice TEXT, artisan VARCHAR(100), specs JSONB, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS alerts (id SERIAL PRIMARY KEY, home_id VARCHAR(50) REFERENCES home(id) ON DELETE CASCADE, title VARCHAR(255), text TEXT, date VARCHAR(50));
      CREATE TABLE IF NOT EXISTS professionals (id SERIAL PRIMARY KEY, home_id VARCHAR(50) REFERENCES home(id) ON DELETE CASCADE, name VARCHAR(100), domain VARCHAR(100), access VARCHAR(50), expires VARCHAR(50));
      CREATE TABLE IF NOT EXISTS documents (id VARCHAR(50) PRIMARY KEY, system_id VARCHAR(50) REFERENCES systems(id) ON DELETE CASCADE, name VARCHAR(255), added VARCHAR(50));
      CREATE TABLE IF NOT EXISTS vault_items (id SERIAL PRIMARY KEY, home_id VARCHAR(50) REFERENCES home(id) ON DELETE CASCADE, title VARCHAR(100), login VARCHAR(100), encrypted_pwd TEXT);
    `);

    await pool.query(`ALTER TABLE systems ADD COLUMN IF NOT EXISTS specs JSONB;`);
    await pool.query(`ALTER TABLE home ADD COLUMN IF NOT EXISTS plans JSONB DEFAULT '[]'::jsonb;`);
    await pool.query(`ALTER TABLE equipment ADD COLUMN IF NOT EXISTS notes TEXT;`);
    await pool.query(`ALTER TABLE professionals ADD COLUMN IF NOT EXISTS phone VARCHAR(50);`);
    await pool.query(`ALTER TABLE professionals ADD COLUMN IF NOT EXISTS email VARCHAR(100);`);
    await pool.query(`ALTER TABLE alerts ADD COLUMN IF NOT EXISTS is_done BOOLEAN DEFAULT FALSE;`);
    await pool.query(`ALTER TABLE systems ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 0;`);
    await pool.query(`ALTER TABLE professionals ADD COLUMN IF NOT EXISTS notes TEXT;`);
    await pool.query(`ALTER TABLE home ADD COLUMN IF NOT EXISTS vault_pin VARCHAR(255);`);
    await pool.query(`ALTER TABLE home ADD COLUMN IF NOT EXISTS diagnostics JSONB DEFAULT '[]'::jsonb;`);
    await pool.query(`ALTER TABLE home ADD COLUMN IF NOT EXISTS custom_widgets JSONB DEFAULT '[]'::jsonb;`);
    await pool.query(`ALTER TABLE home ADD COLUMN IF NOT EXISTS cadastre JSONB DEFAULT '[]'::jsonb;`);

    console.log("Base de données connectée, mise à jour et prête !");
  } catch (error) {
    console.error("Erreur init DB :", error);
  }
}
initDB();

app.use(express.static(path.join(__dirname, "public")));

// --- 🧹 DÉMO AUTO-NETTOYANTE (VERSION COMPLÈTE & CORRIGÉE) ---
app.get("/reset-demo", async (req, res) => {
  try {
    // S'assurer que les tables sont créées si la DB est totalement vierge
    await initDB();

    const id = 'demo-officielle';
    
    // 1. Effacer l'ancienne démo
    await pool.query(`DELETE FROM home WHERE id = $1`, [id]);
    
    // 2. Recréer la maison démo
    const hashedPin = crypto.createHash('sha256').update('1234').digest('hex');
    await pool.query(`INSERT INTO home (id, name, year, surface, land, owner_password, is_setup, vault_pin, plans, diagnostics, custom_widgets, cadastre) 
      VALUES ($1, 'Villa des Pins 🏡 (DPE : B)', 2018, 145, 650, '1234', TRUE, $2,
      '[{"id":"PLN-1","name":"Plan d''architecte (RDC & Étage)","image":"https://images.unsplash.com/photo-1628624747186-a941c476b7ef?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80"}]'::jsonb,
      '[{"name":"DPE (Énergie)","result":"Classe B (71 kWh/m²/an)","date":"2024-02-12"},{"name":"GES (Climat)","result":"Classe A (2 kg CO2/m²/an)","date":"2024-02-12"},{"name":"Amiante","result":"Néant","date":"2024-02-12"}]'::jsonb,
      '[{"title":"📄 Rapport DPE Officiel","content":"Consommation annuelle estimée : entre 850€ et 1150€. Logement très performant, aucune anomalie détectée sur l''isolation.","isHidden":false},{"title":"🔑 Code Portail Électrique","content":"Le code visiteur est : 4589B","isHidden":false}]'::jsonb,
      '{"commune":"Bordeaux","section":"AH","numero":"452","images":[]}'::jsonb
      )`, [id, hashedPin]);

    // 3. Catégories par défaut
    await pool.query(`INSERT INTO systems (id, home_id, name, icon, status, color, display_order) VALUES 
      ('elec_demo', $1, 'Électricité', '⚡', 'À jour', 'green', 1),
      ('eau_demo', $1, 'Plomberie & Eau', '💧', 'À jour', 'green', 2),
      ('chauffe_demo', $1, 'Chauffage', '🔥', 'À jour', 'green', 3),
      ('clim_demo', $1, 'Clim & VMC', '❄️', 'À configurer', 'orange', 4),
      ('piscine_demo', $1, 'Piscine', '🏊', 'À configurer', 'orange', 5),
      ('ext_demo', $1, 'Extérieur', '🌳', 'À configurer', 'orange', 6),
      ('domo_demo', $1, 'Réseau', '📡', 'À configurer', 'orange', 7)`
    , [id]);

    // 4. Équipements
    await pool.query(`INSERT INTO equipment (id, system_id, name, model, installed, notes) VALUES 
      ('EQ-1', 'chauffe_demo', 'Pompe à Chaleur', 'Daikin Altherma 3', '15/09/2023', 'Entretien programmé chaque mois d''octobre.'),
      ('EQ-2', 'elec_demo', 'Tableau Électrique', 'Legrand Drivia', '10/04/2020', 'Disjoncteur différentiel 30mA testé.'),
      ('EQ-3', 'eau_demo', 'Adoucisseur d''eau', 'Culligan', '10/06/2021', 'Vérifier le niveau de sel tous les 3 mois.'),
      ('EQ-4', 'elec_demo', 'Four Encastrable', 'De Dietrich', '24/11/2022', 'Garantie 5 ans.')`);

    // 5. Artisans
    await pool.query(`INSERT INTO professionals (home_id, name, domain, phone, email, access) VALUES 
      ($1, 'Artisan Dupont', 'Plombier-Chauffagiste', '06 12 34 56 78', 'contact@dupont-plomberie.fr', 'Intervenu'),
      ($1, 'Volt & Co', 'Électricien', '06 98 76 54 32', 'hello@voltco.fr', 'Intervenu')`
    , [id]);

    // 6. Alertes
    await pool.query(`INSERT INTO alerts (home_id, title, text, date, is_done) VALUES 
      ($1, 'Entretien Pompe à Chaleur', 'Contacter Artisan Dupont pour la révision annuelle.', '2026-10-15', FALSE),
      ($1, 'Ramonage Cheminée', 'Prévoir le ramonage avant l''hiver.', '2026-11-01', FALSE)`
    , [id]);

    // 7. Redirection
    res.redirect(`/dashboard.html?id=${id}`);
  } catch (err) {
    console.error("Erreur reset-demo:", err);
    res.status(500).send("Erreur lors de la génération de la démo.");
  }
});

// ==========================================
// --- ROUTE STRIPE (COMMANDE DE STICKER) ---
// ==========================================
app.post('/create-checkout-session', async (req, res) => {
  try {
    const newMaisonId = 'ID-' + uuidv4().split('-')[0].toUpperCase(); 

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      shipping_address_collection: {
        allowed_countries: ['FR', 'BE', 'CH'],
      },
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: 'Sticker Officiel Maison ID',
              description: 'Carnet d\'entretien numérique avec QR Code unique pré-configuré.',
            },
            unit_amount: 999,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      metadata: {
        maison_id: newMaisonId
      },
      success_url: `${req.protocol}://${req.get('host')}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.protocol}://${req.get('host')}/`,
    });

    res.json({ id: session.id });
  } catch (error) {
    console.error("Erreur Stripe:", error);
    res.status(500).json({ error: error.message });
  }
});

// --- ROUTES MAISON ET CONNEXION ---
app.get("/scan/:id", async (req, res) => {
  const scannedId = req.params.id;
  try {
    const checkHome = await pool.query(`SELECT is_setup FROM home WHERE id = $1`, [scannedId]);
    if (checkHome.rows.length === 0) return res.redirect(`/setup.html?id=${scannedId}`);
    return res.redirect(`/dashboard.html?id=${scannedId}`);
  } catch (err) { res.status(500).send("Erreur de lecture."); }
});

app.post("/api/login", async (req, res) => {
  const { id, password } = req.body;
  try {
    const user = await pool.query(`SELECT id FROM home WHERE id = $1 AND owner_password = $2`, [id, password]);
    if (user.rows.length > 0) res.json({ ok: true });
    else res.status(401).json({ error: "Mot de passe incorrect." });
  } catch (err) { res.status(500).json({ error: "Erreur serveur." }); }
});

app.post("/api/setup", async (req, res) => {
  const { id, name, year, surface, land, password } = req.body;
  try {
    await pool.query(`INSERT INTO home (id, name, year, surface, land, owner_password, is_setup, plans) VALUES ($1, $2, $3, $4, $5, $6, TRUE, '[]'::jsonb)`, [id, name, parseInt(year), parseInt(surface)||0, parseInt(land)||0, password]);
    
    const defaultSystems = [
      { id: `elec_${id}`, name: "Électricité", icon: "⚡", status: "À configurer", color: "orange", order: 1 },
      { id: `eau_${id}`, name: "Plomberie & Eau", icon: "💧", status: "À configurer", color: "orange", order: 2 },
      { id: `chauffe_${id}`, name: "Chauffage", icon: "🔥", status: "À configurer", color: "orange", order: 3 },
      { id: `clim_${id}`, name: "Clim & VMC", icon: "❄️", status: "À configurer", color: "orange", order: 4 },
      { id: `piscine_${id}`, name: "Piscine", icon: "🏊", status: "À configurer", color: "orange", order: 5 },
      { id: `ext_${id}`, name: "Extérieur", icon: "🌳", status: "À configurer", color: "orange", order: 6 },
      { id: `domo_${id}`, name: "Réseau", icon: "📡", status: "À configurer", color: "orange", order: 7 }
    ];
    
    for (let sys of defaultSystems) { 
      await pool.query(`INSERT INTO systems (id, home_id, name, icon, status, color, display_order) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [sys.id, id, sys.name, sys.icon, sys.status, sys.color, sys.order]); 
    }
    
    res.json({ ok: true, id: id });
  } catch (err) { 
    res.status(500).json({ error: "Erreur serveur" }); 
  }
});

app.get("/api/home", async (req, res) => {
  const homeId = req.query.id; 
  try {
    const homeResult = await pool.query(`SELECT * FROM home WHERE id = $1`, [homeId]);
    if (homeResult.rows.length === 0) return res.status(404).json({ error: "Maison introuvable." });
    
    let systems = (await pool.query(`SELECT * FROM systems WHERE home_id = $1 ORDER BY display_order ASC, id ASC`, [homeId])).rows;
    const equipCount = await pool.query(`SELECT system_id, COUNT(*) as count FROM equipment WHERE system_id IN (SELECT id FROM systems WHERE home_id = $1) GROUP BY system_id`, [homeId]);
    systems = systems.map(sys => {
      const match = equipCount.rows.find(e => e.system_id === sys.id);
      return { ...sys, equipment: match ? parseInt(match.count) : 0 };
    });

    const alerts = (await pool.query(`SELECT * FROM alerts WHERE home_id = $1 ORDER BY id DESC`, [homeId])).rows;
    const pros = (await pool.query(`SELECT * FROM professionals WHERE home_id = $1 ORDER BY id DESC`, [homeId])).rows;

    res.json({ 
      id: homeResult.rows[0].id, 
      name: homeResult.rows[0].name, 
      year: homeResult.rows[0].year, 
      surface: homeResult.rows[0].surface, 
      land: homeResult.rows[0].land, 
      plans: homeResult.rows[0].plans || [], 
      role: "owner", 
      systems, 
      alerts, 
      professionals: pros,
      diagnostics: homeResult.rows[0].diagnostics || [], 
      customWidgets: homeResult.rows[0].custom_widgets || [],
      cadastre: homeResult.rows[0].cadastre || []
    });
  } catch (err) { res.status(500).json({ error: "Erreur serveur." }); }
});

app.post("/api/home/update", async (req, res) => {
  const { id, name, year, surface, land, currentPassword } = req.body;
  try {
    const check = await pool.query(`SELECT id FROM home WHERE id = $1 AND owner_password = $2`, [id, currentPassword]);
    if (check.rows.length === 0) return res.status(401).json({ error: "Mot de passe incorrect." });
    await pool.query(`UPDATE home SET name = $1, year = $2, surface = $3, land = $4 WHERE id = $5`, [name, parseInt(year), parseInt(surface)||0, parseInt(land)||0, id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: "Erreur MAJ." }); }
});

app.post("/api/home/plan", async (req, res) => {
  const { id, name, image } = req.body;
  try {
    const homeRes = await pool.query(`SELECT plans FROM home WHERE id = $1`, [id]);
    let plans = homeRes.rows[0].plans || [];
    plans.push({ id: "PLN-" + Date.now(), name: name, image: image });
    await pool.query(`UPDATE home SET plans = $1 WHERE id = $2`, [JSON.stringify(plans), id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: "Erreur serveur." }); }
});

app.post("/api/home/update-fields", async (req, res) => {
  const { id, diagnostics, customWidgets, cadastre } = req.body;
  if (!id) return res.status(400).json({ error: "ID manquant" });

  try {
    if (diagnostics !== undefined) {
      await pool.query("UPDATE home SET diagnostics = $1 WHERE id = $2", [JSON.stringify(diagnostics), id]);
    }
    if (customWidgets !== undefined) {
      await pool.query("UPDATE home SET custom_widgets = $1 WHERE id = $2", [JSON.stringify(customWidgets), id]);
    }
    if (cadastre !== undefined) {
      await pool.query("UPDATE home SET cadastre = $1 WHERE id = $2", [JSON.stringify(cadastre), id]);
    }
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: "Erreur serveur lors de la sauvegarde" });
  }
});

// --- ROUTES SYSTÈMES, ÉQUIPEMENTS, ALERTES ET ARTISANS ---
app.get("/api/systems/:id", async (req, res) => {
  try {
    const sysResult = await pool.query(`SELECT * FROM systems WHERE id = $1`, [req.params.id]);
    const equipResult = await pool.query(`SELECT * FROM equipment WHERE system_id = $1 ORDER BY created_at ASC`, [req.params.id]);
    if (sysResult.rows.length === 0) return res.status(404).json({ error: "Introuvable" });
    res.json({ id: sysResult.rows[0].id, name: sysResult.rows[0].name, icon: sysResult.rows[0].icon, specs: sysResult.rows[0].specs || {}, equipment: equipResult.rows || [] });
  } catch(e) { res.status(500).json({ error: "Erreur" }); }
});

app.post("/api/systems/add", async (req, res) => {
  const { homeId, name, icon } = req.body;
  const sysId = "SYS-" + Date.now().toString(36).toUpperCase();
  try {
    await pool.query(`INSERT INTO systems (id, home_id, name, icon, status, color, display_order) VALUES ($1, $2, $3, $4, 'À configurer', 'orange', 99)`, [sysId, homeId, name, icon || "⚙️"]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: "Erreur serveur." }); }
});

app.post("/api/systems/update", async (req, res) => {
  const { id, name, icon } = req.body;
  try {
    await pool.query(`UPDATE systems SET name = $1, icon = $2 WHERE id = $3`, [name, icon, id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: "Erreur" }); }
});

app.post("/api/systems/delete", async (req, res) => {
  const { id } = req.body;
  try {
    await pool.query(`DELETE FROM systems WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: "Erreur" }); }
});

app.post("/api/systems/reorder", async (req, res) => {
  const { orderData } = req.body;
  try {
    for (let item of orderData) {
      await pool.query(`UPDATE systems SET display_order = $1 WHERE id = $2`, [item.order, item.id]);
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: "Erreur de tri" }); }
});

app.post("/api/systems/config", async (req, res) => {
  const { systemId, specs } = req.body;
  try {
    await pool.query(`UPDATE systems SET specs = $1, status = 'Configuré', color = 'green' WHERE id = $2`, [specs, systemId]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: "Erreur" }); }
});

app.post("/api/equipment", async (req, res) => {
  const { systemId, name, model, artisan, notice, specs, notes } = req.body;
  const eqId = "EQ-" + Date.now().toString(36).toUpperCase();
  const installedDate = new Date().toLocaleDateString("fr-FR");
  try {
    await pool.query(
      `INSERT INTO equipment (id, system_id, name, model, installed, notice, artisan, specs, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [eqId, systemId, name, model || "", installedDate, notice || null, artisan || null, specs || {}, notes || ""]
    );
    await pool.query(`UPDATE systems SET status = 'À jour', color = 'green' WHERE id = $1`, [systemId]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: "Erreur." }); }
});

app.post("/api/equipment/update", async (req, res) => {
  const { id, name, model, installed, specs, notes } = req.body;
  try {
    await pool.query(`UPDATE equipment SET name = $1, model = $2, installed = $3, specs = $4, notes = $5 WHERE id = $6`, [name, model || "", installed, specs || {}, notes || "", id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: "Erreur de modification." }); }
});

app.post("/api/equipment/delete", async (req, res) => {
  const { id } = req.body;
  try {
    await pool.query(`DELETE FROM equipment WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: "Erreur de suppression." }); }
});

app.post("/api/alerts/add", async (req, res) => {
  const { homeId, title, date, text } = req.body;
  try {
    await pool.query(`INSERT INTO alerts (home_id, title, date, text) VALUES ($1, $2, $3, $4)`, [homeId, title, date, text || ""]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: "Erreur." }); }
});

app.post("/api/alerts/toggle", async (req, res) => {
  const { id, is_done } = req.body;
  try {
    await pool.query(`UPDATE alerts SET is_done = $1 WHERE id = $2`, [is_done, id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: "Erreur." }); }
});

app.post("/api/alerts/update", async (req, res) => {
  const { id, title, date, text } = req.body;
  try {
    await pool.query(`UPDATE alerts SET title = $1, date = $2, text = $3 WHERE id = $4`, [title, date, text || "", id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: "Erreur de modification." }); }
});

app.post("/api/alerts/delete", async (req, res) => {
  const { id } = req.body;
  try {
    await pool.query(`DELETE FROM alerts WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: "Erreur de suppression." }); }
});

app.post("/api/professionals/add", async (req, res) => {
  const { homeId, name, domain, phone, email, notes } = req.body;
  try {
    await pool.query(`INSERT INTO professionals (home_id, name, domain, phone, email, notes, access) VALUES ($1, $2, $3, $4, $5, $6, 'Intervenu')`, [homeId, name, domain, phone || null, email || null, notes || ""]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: "Erreur." }); }
});

app.post("/api/professionals/update", async (req, res) => {
  const { id, name, domain, phone, email, notes } = req.body;
  try {
    await pool.query(`UPDATE professionals SET name = $1, domain = $2, phone = $3, email = $4, notes = $5 WHERE id = $6`, [name, domain, phone || null, email || null, notes || "", id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: "Erreur." }); }
});

app.post("/api/professionals/delete", async (req, res) => {
  const { id } = req.body;
  try {
    await pool.query(`DELETE FROM professionals WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: "Erreur." }); }
});

// --- ROUTES : COFFRE-FORT DE MOTS DE PASSE ---
app.post("/api/vault/check", async (req, res) => {
  const { homeId } = req.body;
  try {
    const home = await pool.query(`SELECT vault_pin FROM home WHERE id = $1`, [homeId]);
    if (home.rows.length === 0) return res.status(404).json({ error: "Maison introuvable" });
    res.json({ isSetup: !!home.rows[0].vault_pin });
  } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
});

app.post("/api/vault/setup", async (req, res) => {
  const { homeId, pin } = req.body;
  try {
    const hashedPin = crypto.createHash('sha256').update(pin).digest('hex');
    await pool.query(`UPDATE home SET vault_pin = $1 WHERE id = $2`, [hashedPin, homeId]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
});

app.post("/api/vault/unlock", async (req, res) => {
  const { homeId, pin } = req.body;
  try {
    const home = await pool.query(`SELECT vault_pin FROM home WHERE id = $1`, [homeId]);
    const hashedPin = crypto.createHash('sha256').update(pin).digest('hex');
    
    if (home.rows[0].vault_pin !== hashedPin) {
      return res.status(401).json({ error: "Code PIN incorrect" });
    }

    const items = await pool.query(`SELECT * FROM vault_items WHERE home_id = $1`, [homeId]);
    const decryptedItems = items.rows.map(item => ({
      id: item.id,
      title: item.title,
      login: item.login,
      password: decryptPassword(item.encrypted_pwd)
    }));

    res.json({ ok: true, items: decryptedItems });
  } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
});

app.post("/api/vault/add", async (req, res) => {
  const { homeId, pin, title, login, password } = req.body;
  try {
    const home = await pool.query(`SELECT vault_pin FROM home WHERE id = $1`, [homeId]);
    const hashedPin = crypto.createHash('sha256').update(pin).digest('hex');
    if (home.rows[0].vault_pin !== hashedPin) return res.status(401).json({ error: "Accès refusé" });

    const encryptedPwd = encryptPassword(password);
    
    await pool.query(
      `INSERT INTO vault_items (home_id, title, login, encrypted_pwd) VALUES ($1, $2, $3, $4)`,
      [homeId, title, login || "", encryptedPwd]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
});

app.post("/api/vault/delete", async (req, res) => {
  const { homeId, pin, itemId } = req.body;
  try {
    const home = await pool.query(`SELECT vault_pin FROM home WHERE id = $1`, [homeId]);
    const hashedPin = crypto.createHash('sha256').update(pin).digest('hex');
    if (home.rows[0].vault_pin !== hashedPin) return res.status(401).json({ error: "Accès refusé" });

    await pool.query(`DELETE FROM vault_items WHERE id = $1`, [itemId]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: "Erreur" }); }
});

app.listen(PORT, () => console.log(`Serveur prêt sur port ${PORT}`));
