require('dotenv').config();
const db = require('./db');

const products = [
  { slug: 'bosch-gsb-13-re-drill', name: 'Bosch GSB 13 RE 600W Impact Drill', brand: 'Bosch', category: 'power-tools', price_paise: 549500, mrp_paise: 699500, hsn: '84672100', stock: 50, specs: { power: '600W', voltage: '230V', warranty: '6 months' }, images: ['/images/bosch-drill.jpg'] },
  { slug: 'makita-9553nb-grinder', name: 'Makita 9553NB 100mm Angle Grinder 710W', brand: 'Makita', category: 'power-tools', price_paise: 689900, mrp_paise: 825000, hsn: '84672900', stock: 40, specs: { power: '710W', voltage: '230V', warranty: '6 months' }, images: ['/images/makita-grinder.jpg'] },
  { slug: 'crompton-5hp-motor', name: 'Crompton 5HP 3-Phase Induction Motor 1440 RPM', brand: 'Crompton', category: 'motors', price_paise: 2499900, mrp_paise: 2899900, hsn: '85015210', stock: 15, specs: { power: '5HP', voltage: '415V 3-phase', warranty: '12 months' }, images: ['/images/motor-5hp.jpg'] },
  { slug: 'siemens-7-5hp-motor', name: 'Siemens 7.5HP 3-Phase Induction Motor 1440 RPM', brand: 'Siemens', category: 'motors', price_paise: 3499900, mrp_paise: 3999900, hsn: '85015210', stock: 10, specs: { power: '7.5HP', voltage: '415V 3-phase', warranty: '12 months' }, images: ['/images/motor-75hp.jpg'] },
  { slug: 'natraj-atta-chakki-2hp', name: 'Natraj 2HP Domestic Atta Chakki Flour Mill', brand: 'Natraj', category: 'machinery', price_paise: 1899900, mrp_paise: 2299900, hsn: '84378010', stock: 20, specs: { power: '2HP', voltage: '230V', warranty: '12 months' }, images: ['/images/atta-chakki.jpg'] },
  { slug: 'elgi-air-compressor-2hp', name: 'ELGi 2HP 200L Air Compressor Single Phase', brand: 'ELGi', category: 'machinery', price_paise: 4599900, mrp_paise: 5299900, hsn: '84148011', stock: 8, specs: { power: '2HP', voltage: '230V', warranty: '12 months' }, images: ['/images/air-compressor.jpg'] },
  { slug: 'ibell-arc-250-welding', name: 'iBELL ARC 250 IGBT Inverter Welding Machine', brand: 'iBELL', category: 'welding', price_paise: 899900, mrp_paise: 1299900, hsn: '85153910', stock: 30, specs: { power: '250A', voltage: '230V', warranty: '12 months' }, images: ['/images/welding-machine.jpg'] },
  { slug: 'bosch-ghp-5-13-pressure-washer', name: 'Bosch GHP 5-13 C High Pressure Washer 2100W', brand: 'Bosch', category: 'cleaning', price_paise: 3249900, mrp_paise: 3820000, hsn: '84243000', stock: 12, specs: { power: '2100W', voltage: '230V', warranty: '6 months' }, images: ['/images/pressure-washer.jpg'] },
  { slug: 'husqvarna-365-chainsaw', name: 'Husqvarna 365 4.9HP Petrol Chainsaw 20 inch', brand: 'Husqvarna', category: 'power-tools', price_paise: 5999900, mrp_paise: 6599900, hsn: '84678100', stock: 7, specs: { power: '4.9HP', voltage: 'Petrol', warranty: '6 months' }, images: ['/images/chainsaw.jpg'] },
  { slug: 'kirloskar-1hp-water-pump', name: 'Kirloskar 1HP Monoblock Water Pump Jalraaj', brand: 'Kirloskar', category: 'pumps', price_paise: 949900, mrp_paise: 1129900, hsn: '84137010', stock: 25, specs: { power: '1HP', voltage: '230V', warranty: '12 months' }, images: ['/images/water-pump.jpg'] },
  { slug: 'bosch-gdc-141-tile-cutter', name: 'Bosch GDC 141 Marble/Tile Cutter 1400W', brand: 'Bosch', category: 'power-tools', price_paise: 789500, mrp_paise: 920000, hsn: '84672200', stock: 35, specs: { power: '1400W', voltage: '230V', warranty: '6 months' }, images: ['/images/tile-cutter.jpg'] },
  { slug: 'stanley-sdh-600-drill-13mm', name: 'Stanley SDH 600W 13mm Hammer Drill', brand: 'Stanley', category: 'power-tools', price_paise: 429900, mrp_paise: 545000, hsn: '84672100', stock: 45, specs: { power: '600W', voltage: '230V', warranty: '6 months' }, images: ['/images/stanley-drill.jpg'] },
];

async function main() {
  for (const p of products) {
    await db.query(
      `INSERT INTO products (slug, name, brand, category, price_paise, mrp_paise, hsn, stock, specs, images)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (slug) DO NOTHING`,
      [p.slug, p.name, p.brand, p.category, p.price_paise, p.mrp_paise, p.hsn, p.stock, JSON.stringify(p.specs), p.images]
    );
  }
  const r = await db.query('SELECT COUNT(*)::int AS n FROM products');
  console.log(`[seed] done. products count = ${r.rows[0].n}`);
  await db.pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
