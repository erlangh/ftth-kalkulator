// FTTH Kalkulator - Client-side logic
// Assumptions:
// - Uploaded KML/KMZ contains ODC points (Point features) and feeder route lines (LineString features).
// - We treat all LineStrings as feeder routes (you can rename layer names later).
// - ODPs are generated radially around each ODC and connected with distribution lines; spacing ~100m.

const state = {
  uploaded: null, // { geojson, filename }
  odcPoints: [],
  feederLines: [],
  poles: [],
  odps: [],
  distLines: [],
  material: {
    poles: 0,
    poleType: '6',
    poleSpacing: 50,
    feederCore: 12,
    feederLength: 0,
    distributionLength: 0,
    odcCount: 0,
    odpPerOdc: 4,
    odpCount: 0,
  },
  map: null,
  layers: {
    odc: null,
    feeder: null,
    poles: null,
    odp: null,
    dist: null,
  }
};

const map = L.map('map').setView([ -6.2, 106.8 ], 12);
state.map = map;
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const fileInput = document.getElementById('fileInput');
const processBtn = document.getElementById('processBtn');
const exportKmlBtn = document.getElementById('exportKmlBtn');
const exportKmzBtn = document.getElementById('exportKmzBtn');
const exportPdfBtn = document.getElementById('exportPdfBtn');
const poleTypeEl = document.getElementById('poleType');
const poleSpacingEl = document.getElementById('poleSpacing');
const feederCoreEl = document.getElementById('feederCore');
const odpPerOdcEl = document.getElementById('odpPerOdc');
const summaryContent = document.getElementById('summaryContent');

poleTypeEl.addEventListener('change', () => state.material.poleType = poleTypeEl.value);
poleSpacingEl.addEventListener('change', () => state.material.poleSpacing = Number(poleSpacingEl.value));
feederCoreEl.addEventListener('change', () => state.material.feederCore = Number(feederCoreEl.value));
odpPerOdcEl.addEventListener('change', () => state.material.odpPerOdc = Number(odpPerOdcEl.value));

fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const geojson = await readKmlKmzToGeoJSON(file);
  state.uploaded = { geojson, filename: file.name };
  const { odcPoints, feederLines } = splitFeatures(geojson);
  state.odcPoints = odcPoints;
  state.feederLines = feederLines;
  renderUploaded();
  exportKmlBtn.disabled = true;
  exportKmzBtn.disabled = true;
  exportPdfBtn.disabled = true;
});

processBtn.addEventListener('click', () => {
  if (!state.uploaded) { alert('Silakan upload KML/KMZ terlebih dahulu.'); return; }
  computePoles();
  computeODPAndDistribution();
  computeMaterialSummary();
  renderComputed();
  exportKmlBtn.disabled = false;
  exportKmzBtn.disabled = false;
  exportPdfBtn.disabled = false;
});

exportKmlBtn.addEventListener('click', () => {
  const kmlStr = buildKml();
  const blob = new Blob([kmlStr], { type: 'application/vnd.google-earth.kml+xml' });
  const outName = (state.uploaded?.filename || 'output.kml').replace(/\.(kml|kmz)$/i, '') + '_enhanced.kml';
  saveAs(blob, outName);
});

exportKmzBtn.addEventListener('click', async () => {
  const zip = new JSZip();
  const kmlStr = buildKml();
  zip.file('doc.kml', kmlStr);
  const content = await zip.generateAsync({ type: 'blob' });
  const outName = (state.uploaded?.filename || 'output.kmz').replace(/\.(kml|kmz)$/i, '') + '_enhanced.kmz';
  saveAs(content, outName);
});

exportPdfBtn.addEventListener('click', () => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setFontSize(14);
  doc.text('Laporan Material FTTH', 14, 20);
  doc.setFontSize(11);
  const m = state.material;
  const lines = [
    `Jumlah ODC: ${m.odcCount}`,
    `ODP per ODC: ${m.odpPerOdc}`,
    `Jumlah ODP: ${m.odpCount}`,
    `Jenis Tiang: ${m.poleType}m`,
    `Jarak Antar Tiang: ${m.poleSpacing} m`,
    `Jumlah Tiang: ${m.poles}`,
    `Feeder: ${m.feederCore} core`,
    `Panjang Kabel Feeder: ${m.feederLength.toFixed(1)} m`,
    `Panjang Kabel Distribusi: ${m.distributionLength.toFixed(1)} m`,
  ];
  let y = 32;
  lines.forEach(line => { doc.text(line, 14, y); y += 7; });
  doc.save('laporan_ftth.pdf');
});

function renderUploaded() {
  // Clear old layers
  clearLayers();
  const odcLayer = L.geoJSON({ type: 'FeatureCollection', features: state.odcPoints }, {
    pointToLayer: (f, latlng) => L.circleMarker(latlng, { radius: 6, color: '#004aad', fillColor: '#4ea3ff', fillOpacity: 0.8 })
  }).addTo(map);
  const feederLayer = L.geoJSON({ type: 'FeatureCollection', features: state.feederLines }, {
    style: () => ({ color: '#ff6b00', weight: 3 })
  }).addTo(map);
  state.layers.odc = odcLayer;
  state.layers.feeder = feederLayer;
  try { map.fitBounds(feederLayer.getBounds(), { padding: [20, 20] }); } catch {}
}

function renderComputed() {
  if (state.layers.poles) map.removeLayer(state.layers.poles);
  if (state.layers.odp) map.removeLayer(state.layers.odp);
  if (state.layers.dist) map.removeLayer(state.layers.dist);

  state.layers.poles = L.geoJSON({ type: 'FeatureCollection', features: state.poles }, {
    pointToLayer: (f, latlng) => L.circleMarker(latlng, { radius: 4, color: '#333', fillColor: '#aaa', fillOpacity: 1 })
  }).addTo(map);

  state.layers.odp = L.geoJSON({ type: 'FeatureCollection', features: state.odps }, {
    pointToLayer: (f, latlng) => L.circleMarker(latlng, { radius: 5, color: '#0b5', fillColor: '#7fda8f', fillOpacity: 0.9 })
  }).addTo(map);

  state.layers.dist = L.geoJSON({ type: 'FeatureCollection', features: state.distLines }, {
    style: () => ({ color: '#00b894', weight: 2, dashArray: '4,4' })
  }).addTo(map);

  summaryContent.innerHTML = `
    <ul>
      <li>Jumlah ODC: <b>${state.material.odcCount}</b></li>
      <li>ODP per ODC: <b>${state.material.odpPerOdc}</b></li>
      <li>Jumlah ODP: <b>${state.material.odpCount}</b></li>
      <li>Jenis Tiang: <b>${state.material.poleType}m</b></li>
      <li>Jarak Antar Tiang: <b>${state.material.poleSpacing} m</b></li>
      <li>Jumlah Tiang: <b>${state.material.poles}</b></li>
      <li>Feeder: <b>${state.material.feederCore} core</b></li>
      <li>Panjang Kabel Feeder: <b>${state.material.feederLength.toFixed(1)} m</b></li>
      <li>Panjang Kabel Distribusi: <b>${state.material.distributionLength.toFixed(1)} m</b></li>
    </ul>
  `;
}

function clearLayers() {
  ['odc','feeder','poles','odp','dist'].forEach(k => {
    if (state.layers[k]) { try { map.removeLayer(state.layers[k]); } catch {} }
    state.layers[k] = null;
  });
}

async function readKmlKmzToGeoJSON(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.kml')) {
    const text = await file.text();
    const dom = new DOMParser().parseFromString(text, 'text/xml');
    return toGeoJSON.kml(dom);
  } else if (name.endsWith('.kmz')) {
    const zip = await JSZip.loadAsync(file);
    // Try typical names: doc.kml or first .kml
    let kmlFile = zip.file('doc.kml');
    if (!kmlFile) {
      const kmlEntries = Object.keys(zip.files).filter(k => k.toLowerCase().endsWith('.kml'));
      if (kmlEntries.length === 0) throw new Error('KMZ tidak berisi KML.');
      kmlFile = zip.file(kmlEntries[0]);
    }
    const kmlText = await kmlFile.async('text');
    const dom = new DOMParser().parseFromString(kmlText, 'text/xml');
    return toGeoJSON.kml(dom);
  }
  throw new Error('Format file tidak didukung.');
}

function splitFeatures(geojson) {
  const odcPoints = [];
  const feederLines = [];
  const feats = geojson.features || [];
  feats.forEach(f => {
    const g = f.geometry;
    if (!g) return;
    if (g.type === 'Point') {
      odcPoints.push(f);
    } else if (g.type === 'LineString' || g.type === 'MultiLineString') {
      feederLines.push(f);
    }
  });
  return { odcPoints, feederLines };
}

function computePoles() {
  const spacing = state.material.poleSpacing;
  const poles = [];
  let feederTotal = 0;

  state.feederLines.forEach(line => {
    const geom = line.geometry;
    const lineStr = geom.type === 'LineString' ? geom : turf.flatten(line).features[0].geometry;
    const length = turf.length({ type: 'Feature', geometry: lineStr }, { units: 'kilometers' });
    feederTotal += length * 1000;
    // Place poles every spacing meters along the line
    const meters = length * 1000;
    const count = Math.max(1, Math.floor(meters / spacing));
    for (let i = 0; i <= count; i++) {
      const distKm = (i * spacing) / 1000;
      const pt = turf.along({ type: 'Feature', geometry: lineStr }, distKm, { units: 'kilometers' });
      poles.push({ type: 'Feature', properties: { type: `pole_${state.material.poleType}m` }, geometry: pt.geometry });
    }
  });

  state.poles = poles;
  state.material.feederLength = feederTotal;
  state.material.poles = poles.length;
}

function computeODPAndDistribution() {
  const odpPer = state.material.odpPerOdc;
  const odps = [];
  const distLines = [];
  let distTotal = 0;

  state.odcPoints.forEach(odc => {
    const origin = odc.geometry.coordinates; // [lng, lat]
    // Create radial ODPs at ~100m in 4/8/12/16 directions
    const radiusMeters = 120; // default distribution length per ODP
    for (let i = 0; i < odpPer; i++) {
      const angle = (2 * Math.PI * i) / odpPer;
      const dx = (radiusMeters / 111320) * Math.cos(angle); // deg lon approx at equator
      const dy = (radiusMeters / 110540) * Math.sin(angle); // deg lat approx
      const lng = origin[0] + dx;
      const lat = origin[1] + dy;
      const odpPoint = { type: 'Feature', properties: { type: 'odp' }, geometry: { type: 'Point', coordinates: [lng, lat] } };
      odps.push(odpPoint);
      const line = { type: 'Feature', properties: { type: 'distribution' }, geometry: { type: 'LineString', coordinates: [origin, [lng, lat]] } };
      distLines.push(line);
      distTotal += radiusMeters;
    }
  });

  state.odps = odps;
  state.distLines = distLines;
  state.material.odcCount = state.odcPoints.length;
  state.material.odpCount = odps.length;
  state.material.distributionLength = distTotal;
}

function computeMaterialSummary() {
  // Already updated during computePoles and computeODPAndDistribution
}

function buildKml() {
  // Build a simple KML with folders: ODC, Feeder, Poles, ODP, Distribution
  const kmlHeader = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document>`;
  const kmlFooter = `</Document></kml>`;

  function coordsToKml(coords) {
    if (Array.isArray(coords[0])) {
      return coords.map(c => c.join(',')).join(' ');
    }
    return coords.join(',');
  }
  function pointPlacemark(name, coord) {
    return `<Placemark><name>${name}</name><Point><coordinates>${coord.join(',')}</coordinates></Point></Placemark>`;
  }
  function linePlacemark(name, coords) {
    return `<Placemark><name>${name}</name><LineString><tessellate>1</tessellate><coordinates>${coordsToKml(coords)}</coordinates></LineString></Placemark>`;
  }

  let body = '';
  body += `<Folder><name>ODC</name>`;
  state.odcPoints.forEach((f, idx) => { body += pointPlacemark(`ODC ${idx+1}`, f.geometry.coordinates); });
  body += `</Folder>`;

  body += `<Folder><name>Feeder</name>`;
  state.feederLines.forEach((f, idx) => {
    const g = f.geometry;
    if (g.type === 'LineString') body += linePlacemark(`Feeder ${idx+1}`, g.coordinates);
    else if (g.type === 'MultiLineString') g.coordinates.forEach((c, j) => body += linePlacemark(`Feeder ${idx+1}.${j+1}`, c));
  });
  body += `</Folder>`;

  body += `<Folder><name>Poles</name>`;
  state.poles.forEach((f, idx) => { body += pointPlacemark(`Pole ${idx+1} (${state.material.poleType}m)`, f.geometry.coordinates); });
  body += `</Folder>`;

  body += `<Folder><name>ODP</name>`;
  state.odps.forEach((f, idx) => { body += pointPlacemark(`ODP ${idx+1}`, f.geometry.coordinates); });
  body += `</Folder>`;

  body += `<Folder><name>Distribution</name>`;
  state.distLines.forEach((f, idx) => { body += linePlacemark(`Distribusi ${idx+1}`, f.geometry.coordinates); });
  body += `</Folder>`;

  return kmlHeader + body + kmlFooter;
}