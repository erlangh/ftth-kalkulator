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
const exportXlsxBtn = document.getElementById('exportXlsxBtn');
const odcSnapModeEl = document.getElementById('odcSnapMode');
const showLabelsEl = document.getElementById('showLabels');
const odcLabelPrefixEl = document.getElementById('odcLabelPrefix');
const odpLabelPrefixEl = document.getElementById('odpLabelPrefix');

poleTypeEl.addEventListener('change', () => state.material.poleType = poleTypeEl.value);
poleSpacingEl.addEventListener('change', () => state.material.poleSpacing = Number(poleSpacingEl.value));
feederCoreEl.addEventListener('change', () => state.material.feederCore = Number(feederCoreEl.value));
odpPerOdcEl.addEventListener('change', () => state.material.odpPerOdc = Number(odpPerOdcEl.value));

const feederNameSelect = document.getElementById('feederNameSelect');
const feederMaxProjEl = document.getElementById('feederMaxProj');

state.feederNameFilter = state.feederNameFilter || '';
state.feederMaxProjMeters = state.feederMaxProjMeters || 200;
if (feederMaxProjEl) feederMaxProjEl.value = String(state.feederMaxProjMeters);
state.odcSnapMode = state.odcSnapMode || 'nearest';
if (odcSnapModeEl) odcSnapModeEl.value = state.odcSnapMode;
if (odcSnapModeEl) odcSnapModeEl.addEventListener('change', () => {
  state.odcSnapMode = odcSnapModeEl.value || 'nearest';
});
state.showLabels = !!state.showLabels;
if (showLabelsEl) showLabelsEl.checked = !!state.showLabels;
if (showLabelsEl) showLabelsEl.addEventListener('change', () => {
  state.showLabels = !!showLabelsEl.checked;
});

// Inisialisasi dan binding prefix label ODC/ODP
state.odcLabelPrefix = typeof state.odcLabelPrefix === 'string' ? state.odcLabelPrefix : (odcLabelPrefixEl && odcLabelPrefixEl.value ? odcLabelPrefixEl.value : 'ODC-');
state.odpLabelPrefix = typeof state.odpLabelPrefix === 'string' ? state.odpLabelPrefix : (odpLabelPrefixEl && odpLabelPrefixEl.value ? odpLabelPrefixEl.value : 'ODP-');
if (odcLabelPrefixEl) odcLabelPrefixEl.value = state.odcLabelPrefix;
if (odpLabelPrefixEl) odpLabelPrefixEl.value = state.odpLabelPrefix;
if (odcLabelPrefixEl) odcLabelPrefixEl.addEventListener('input', () => {
  state.odcLabelPrefix = odcLabelPrefixEl.value || 'ODC-';
  if (state.showLabels) {
    if (state.uploaded) renderUploaded();
    if (state.odps && state.odps.length) renderComputed();
  }
});
if (odpLabelPrefixEl) odpLabelPrefixEl.addEventListener('input', () => {
  state.odpLabelPrefix = odpLabelPrefixEl.value || 'ODP-';
  if (state.showLabels) {
    if (state.uploaded) renderUploaded();
    if (state.odps && state.odps.length) renderComputed();
  }
});
function populateFeederNameOptions(geojson) {
  if (!feederNameSelect) return;
  const feats = geojson.features || [];
  const names = new Set();
  feats.forEach(f => {
    const g = f.geometry;
    if (!g) return;
    if (g.type === 'LineString' || g.type === 'MultiLineString') {
      const nm = (f.properties && f.properties.name ? String(f.properties.name) : '').trim();
      if (nm) names.add(nm);
    }
  });
  feederNameSelect.innerHTML = '<option value="">Semua garis</option>' + Array.from(names).map(n => `<option value="${n}">${n}</option>`).join('');
  feederNameSelect.disabled = false;
}

if (feederNameSelect) {
  feederNameSelect.addEventListener('change', () => {
    state.feederNameFilter = feederNameSelect.value || '';
    if (state.uploaded) {
      const { odcPoints, feederLines } = splitFeatures(state.uploaded.geojson);
      state.odcPoints = odcPoints;
      state.feederLines = feederLines;
      renderUploaded();
    }
  });
}
if (feederMaxProjEl) {
  feederMaxProjEl.addEventListener('change', () => {
    state.feederMaxProjMeters = Number(feederMaxProjEl.value) || 200;
  });
}

fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const geojson = await readKmlKmzToGeoJSON(file);
  state.uploaded = { geojson, filename: file.name };
  populateFeederNameOptions(geojson);
  const { odcPoints, feederLines } = splitFeatures(geojson);
  state.odcPoints = odcPoints;
  state.feederLines = feederLines;
  renderUploaded();
  exportKmlBtn.disabled = true;
  exportKmzBtn.disabled = true;
  exportPdfBtn.disabled = true;
  if (exportXlsxBtn) exportXlsxBtn.disabled = true;
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
  if (exportXlsxBtn) exportXlsxBtn.disabled = false;
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
  let odcIdx = 0;
  const odcLayer = L.geoJSON({ type: 'FeatureCollection', features: state.odcPoints }, {
    pointToLayer: (f, latlng) => L.circleMarker(latlng, { radius: 6, color: '#004aad', fillColor: '#4ea3ff', fillOpacity: 0.8 }),
    onEachFeature: (f, layer) => {
      if (state.showLabels) {
        layer.bindTooltip(`${state.odcLabelPrefix || 'ODC-'}${++odcIdx}`, { permanent: true, direction: 'top', className: 'label-s' });
      }
    }
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

  let odpIdx = 0;
  state.layers.odp = L.geoJSON({ type: 'FeatureCollection', features: state.odps }, {
    pointToLayer: (f, latlng) => L.circleMarker(latlng, { radius: 5, color: '#0b5', fillColor: '#7fda8f', fillOpacity: 0.9 }),
    onEachFeature: (f, layer) => {
      if (state.showLabels) {
        layer.bindTooltip(`${state.odpLabelPrefix || 'ODP-'}${++odpIdx}`, { permanent: true, direction: 'top', className: 'label-s' });
      }
    }
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

const odpSpacingFeederEl = document.getElementById('odpSpacingFeeder');
const feederKeywordEl = document.getElementById('feederKeyword');

// initialize defaults
state.material.odpSpacingMeters = state.material.odpSpacingMeters || 120;
state.feederKeyword = state.feederKeyword || 'feeder';
if (odpSpacingFeederEl) odpSpacingFeederEl.value = String(state.material.odpSpacingMeters);
if (feederKeywordEl) feederKeywordEl.value = state.feederKeyword;

if (odpSpacingFeederEl) {
  odpSpacingFeederEl.addEventListener('change', () => {
    state.material.odpSpacingMeters = Number(odpSpacingFeederEl.value) || 120;
  });
}
if (feederKeywordEl) {
  feederKeywordEl.addEventListener('input', () => {
    const kw = feederKeywordEl.value.trim().toLowerCase();
    state.feederKeyword = kw || 'feeder';
    if (state.uploaded) {
      const { odcPoints, feederLines } = splitFeatures(state.uploaded.geojson);
      state.odcPoints = odcPoints;
      state.feederLines = feederLines;
      renderUploaded();
    }
  });
}

function splitFeatures(geojson) {
  const odcPoints = [];
  let feederLines = [];
  const otherLines = [];
  const feats = geojson.features || [];
  const kw = (state.feederKeyword || 'feeder').toLowerCase();
  const nameFilter = (state.feederNameFilter || '').toLowerCase();
  feats.forEach(f => {
    const g = f.geometry;
    if (!g) return;
    const name = (f.properties && f.properties.name ? String(f.properties.name) : '').toLowerCase();
    const styleUrl = (f.properties && f.properties.styleUrl ? String(f.properties.styleUrl) : '').toLowerCase();
    let isFeederHint = false;
    if (nameFilter) {
      isFeederHint = name.includes(nameFilter);
    } else {
      isFeederHint = name.includes(kw) || styleUrl.includes(kw);
    }
    if (g.type === 'Point') {
      odcPoints.push(f);
    } else if (g.type === 'LineString' || g.type === 'MultiLineString') {
      if (isFeederHint) feederLines.push(f); else otherLines.push(f);
    }
  });
  if (feederLines.length === 0) feederLines = otherLines;
  return { odcPoints, feederLines };
}

function computePoles() {
  const spacing = state.material.poleSpacing;
  const poles = [];
  let feederTotal = 0;

  state.feederLines.forEach((line, lineIdx) => {
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
      poles.push({ type: 'Feature', properties: { type: `pole_${state.material.poleType}m`, lineIndex: lineIdx, locationKm: distKm }, geometry: pt.geometry });
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

  function nearestOnFeeder(odc) {
    let best = null;
    let bestDist = Infinity;
    let bestLine = null;
    let bestIdx = null;
    state.feederLines.forEach((line, idx) => {
      let lineStr = line.geometry;
      if (lineStr.type !== 'LineString') {
        const flat = turf.flatten(line).features;
        flat.forEach(ff => {
          const np = turf.nearestPointOnLine(ff, odc);
          const d = turf.distance(odc, np, { units: 'kilometers' }) * 1000;
          if (d < bestDist) { bestDist = d; best = np; bestLine = ff; bestIdx = idx; }
        });
        return;
      }
      const featureLine = { type:'Feature', geometry: lineStr };
      const np = turf.nearestPointOnLine(featureLine, odc);
      const d = turf.distance(odc, np, { units: 'kilometers' }) * 1000;
      if (d < bestDist) { bestDist = d; best = np; bestLine = featureLine; bestIdx = idx; }
    });
    if (best && bestDist > (state.feederMaxProjMeters || 200)) return { nearestPoint: null, lineFeature: null, lineIndex: null };
    return { nearestPoint: best, lineFeature: bestLine, lineIndex: bestIdx };
  }

  function nearestPole(pointFeature) {
    let best = null;
    let bestDist = Infinity;
    state.poles.forEach(p => {
      const d = turf.distance(pointFeature, p, { units: 'kilometers' });
      if (d < bestDist) { bestDist = d; best = p; }
    });
    return { pole: best, distKm: bestDist };
  }

  const usedPoleKeys = new Set();
  const snappedOdcPoints = [];

  state.odcPoints.forEach(odc => {
    const originalCoord = odc.geometry.coordinates;
    const odcFeatOriginal = { type:'Feature', geometry: { type:'Point', coordinates: originalCoord } };

    // Tentukan snap ODC sesuai mode
    let snappedOdc = null;
    if (state.odcSnapMode === 'first_line' || state.odcSnapMode === 'last_line') {
      const info = nearestOnFeeder(odcFeatOriginal);
      const lineIdx = info.lineIndex;
      if (lineIdx !== null && lineIdx !== undefined) {
        const polesOnLine = state.poles.filter(p => p.properties && p.properties.lineIndex === lineIdx);
        if (polesOnLine.length > 0) {
          polesOnLine.sort((a,b) => (a.properties.locationKm - b.properties.locationKm));
          snappedOdc = (state.odcSnapMode === 'first_line') ? polesOnLine[0] : polesOnLine[polesOnLine.length - 1];
        }
      }
    }
    if (!snappedOdc) {
      // Default: snap ke tiang terdekat
      snappedOdc = nearestPole(odcFeatOriginal).pole || odcFeatOriginal;
    }

    const origin = snappedOdc.geometry.coordinates;
    snappedOdcPoints.push({ type:'Feature', properties: odc.properties || {}, geometry: { type:'Point', coordinates: origin } });

    const { nearestPoint, lineFeature } = nearestOnFeeder(odcFeatOriginal);
    const lineLenKm = lineFeature ? turf.length(lineFeature, { units: 'kilometers' }) : 0;
    const spacingKm = (state.material.odpSpacingMeters || 120) / 1000;
    const startKm = nearestPoint ? nearestPoint.properties.location : 0;

    if (!nearestPoint || !lineFeature) {
      // Tidak ada feeder dalam batas, pilih ODP dari tiang terdekat ke ODC (snapped)
      const odcFeatSnapped = { type:'Feature', geometry:{ type:'Point', coordinates: origin } };
      // Ambil N tiang terdekat selain tiang ODC
      const polesSorted = state.poles.slice().sort((a,b) => {
        const da = turf.distance(odcFeatSnapped, a, { units:'kilometers' });
        const db = turf.distance(odcFeatSnapped, b, { units:'kilometers' });
        return da - db;
      });
      let added = 0;
      for (const p of polesSorted) {
        const key = p.geometry.coordinates.join(',');
        if (key === origin.join(',')) continue; // jangan pakai tiang yang sama dengan ODC
        if (usedPoleKeys.has(key)) continue;
        const coord = p.geometry.coordinates;
        const odpPoint = { type:'Feature', properties:{ type:'odp' }, geometry:{ type:'Point', coordinates: coord } };
        odps.push(odpPoint);
        const distLine = { type:'Feature', properties:{ type:'distribution' }, geometry:{ type:'LineString', coordinates: [origin, coord] } };
        distLines.push(distLine);
        distTotal += turf.distance({type:'Feature', geometry:{type:'Point', coordinates: origin}}, {type:'Feature', geometry:{type:'Point', coordinates: coord}}, { units:'kilometers' }) * 1000;
        usedPoleKeys.add(key);
        added++;
        if (added >= odpPer) break;
      }
      return;
    }

    for (let i = 1; i <= odpPer; i++) {
      const step = Math.ceil(i / 2);
      const dir = (i % 2 === 1) ? 1 : -1;
      let targetKm = startKm + dir * step * spacingKm;
      if (targetKm < 0) targetKm = 0;
      if (targetKm > lineLenKm) targetKm = lineLenKm;
      const alongPt = turf.along(lineFeature, targetKm, { units: 'kilometers' });
      // Snap ODP ke tiang terdekat dari titik along
      const nearestPoleToAlong = nearestPole(alongPt).pole;
      const coord = (nearestPoleToAlong ? nearestPoleToAlong.geometry.coordinates : alongPt.geometry.coordinates);
      const key = coord.join(',');
      if (key === origin.join(',')) continue; // hindari tiang ODC
      if (usedPoleKeys.has(key)) continue; // hindari duplikasi ODP pada tiang sama
      const odpPoint = { type:'Feature', properties: { type: 'odp' }, geometry: { type: 'Point', coordinates: coord } };
      odps.push(odpPoint);
      const distLine = { type: 'Feature', properties: { type: 'distribution' }, geometry: { type: 'LineString', coordinates: [origin, coord] } };
      distLines.push(distLine);
      distTotal += turf.distance({type:'Feature', geometry:{type:'Point', coordinates: origin}}, {type:'Feature', geometry:{type:'Point', coordinates: coord}}, { units:'kilometers' }) * 1000;
      usedPoleKeys.add(key);
    }
  });

  // Ganti ODC dengan versi snapped pada state
  state.odcPoints = snappedOdcPoints;
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
  const kmlHeader = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document>`;
  const styles = `
    <Style id="style_odc"><IconStyle><color>ff4ea3ff</color><scale>1.2</scale><Icon><href>http://maps.google.com/mapfiles/kml/paddle/blu-circle.png</href></Icon></IconStyle></Style>
    <Style id="style_feeder"><LineStyle><color>ff006bff</color><width>3</width></LineStyle></Style>
    <Style id="style_pole"><IconStyle><color>ffaaaaaa</color><scale>1.0</scale><Icon><href>http://maps.google.com/mapfiles/kml/paddle/wht-circle.png</href></Icon></IconStyle></Style>
    <Style id="style_odp"><IconStyle><color>ff8fda7f</color><scale>1.2</scale><Icon><href>http://maps.google.com/mapfiles/kml/paddle/grn-circle.png</href></Icon></IconStyle></Style>
    <Style id="style_dist"><LineStyle><color>ff94b800</color><width>2</width></LineStyle></Style>
  `;
  const kmlFooter = `</Document></kml>`;

  function coordsToKml(coords) {
    if (Array.isArray(coords[0])) {
      return coords.map(c => c.join(',')).join(' ');
    }
    return coords.join(',');
  }
  function pointPlacemark(name, coord, style) {
    return `<Placemark><name>${name}</name><styleUrl>#${style}</styleUrl><Point><coordinates>${coord.join(',')}</coordinates></Point></Placemark>`;
  }
  function linePlacemark(name, coords, style) {
    return `<Placemark><name>${name}</name><styleUrl>#${style}</styleUrl><LineString><tessellate>1</tessellate><coordinates>${coordsToKml(coords)}</coordinates></LineString></Placemark>`;
  }

  let body = styles;
  body += `<Folder><name>ODC</name>`;
  state.odcPoints.forEach((f, idx) => { body += pointPlacemark(`ODC ${idx+1}`, f.geometry.coordinates, 'style_odc'); });
  body += `</Folder>`;

  body += `<Folder><name>Feeder</name>`;
  state.feederLines.forEach((f, idx) => {
    const g = f.geometry;
    if (g.type === 'LineString') body += linePlacemark(`Feeder ${idx+1}`, g.coordinates, 'style_feeder');
    else if (g.type === 'MultiLineString') g.coordinates.forEach((c, j) => body += linePlacemark(`Feeder ${idx+1}.${j+1}`, c, 'style_feeder'));
  });
  body += `</Folder>`;

  body += `<Folder><name>Poles</name>`;
  state.poles.forEach((f, idx) => { body += pointPlacemark(`Pole ${idx+1} (${state.material.poleType}m)`, f.geometry.coordinates, 'style_pole'); });
  body += `</Folder>`;

  body += `<Folder><name>ODP</name>`;
  state.odps.forEach((f, idx) => { body += pointPlacemark(`ODP ${idx+1}`, f.geometry.coordinates, 'style_odp'); });
  body += `</Folder>`;

  body += `<Folder><name>Distribution</name>`;
  state.distLines.forEach((f, idx) => { body += linePlacemark(`Distribusi ${idx+1}`, f.geometry.coordinates, 'style_dist'); });
  body += `</Folder>`;

  return kmlHeader + body + kmlFooter;
}

function safeName(base, suffix, ext) {
  const stem = (state.uploaded?.filename || base).replace(/\.(kml|kmz|pdf|xlsx)$/i, '');
  return `${stem}_${suffix}.${ext}`;
}

function buildWorkbook() {
  const wb = XLSX.utils.book_new();
  const m = state.material;
  const summaryAoa = [
    ['Jumlah ODC', m.odcCount],
    ['ODP per ODC', m.odpPerOdc],
    ['Jumlah ODP', m.odpCount],
    ['Jenis Tiang (m)', m.poleType],
    ['Jarak Antar Tiang (m)', m.poleSpacing],
    ['Jumlah Tiang', m.poles],
    ['Feeder (core)', m.feederCore],
    ['Panjang Kabel Feeder (m)', Number(m.feederLength.toFixed(1))],
    ['Panjang Kabel Distribusi (m)', Number(m.distributionLength.toFixed(1))],
    ['Kata Kunci Feeder', state.feederKeyword || ''],
    ['Nama Feeder (filter)', state.feederNameFilter || ''],
    ['Batas Jarak ODC→Feeder (m)', state.feederMaxProjMeters || 200],
    ['Jarak ODP Sepanjang Feeder (m)', state.material.odpSpacingMeters || 120],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet([['Parameter','Nilai'], ...summaryAoa]);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Ringkasan');

  const odcAoa = [['#','Longitude','Latitude','Nama']];
  state.odcPoints.forEach((f, i) => {
    const c = f.geometry.coordinates;
    const nm = (f.properties && f.properties.name) ? String(f.properties.name) : '';
    odcAoa.push([i+1, c[0], c[1], nm]);
  });
  const wsOdc = XLSX.utils.aoa_to_sheet(odcAoa);
  XLSX.utils.book_append_sheet(wb, wsOdc, 'ODC');

  const odpAoa = [['#','ODC #','Longitude','Latitude']];
  const distAoa = [['#','ODC #','ODP #','ODC Lon','ODC Lat','ODP Lon','ODP Lat','Panjang (m)']];
  let idx = 0;
  state.odcPoints.forEach((odc, odcIdx) => {
    const origin = odc.geometry.coordinates;
    for (let k = 0; k < state.material.odpPerOdc; k++) {
      const odp = state.odps[idx];
      const distLine = state.distLines[idx];
      if (!odp || !distLine) break;
      const oc = odp.geometry.coordinates;
      odpAoa.push([idx+1, odcIdx+1, oc[0], oc[1]]);
      const lenM = turf.distance({type:'Feature', geometry:{type:'Point', coordinates: origin}}, {type:'Feature', geometry:{type:'Point', coordinates: oc}}, {units:'kilometers'}) * 1000;
      distAoa.push([idx+1, odcIdx+1, (k+1), origin[0], origin[1], oc[0], oc[1], Number(lenM.toFixed(1))]);
      idx++;
    }
  });
  const wsOdp = XLSX.utils.aoa_to_sheet(odpAoa);
  const wsDist = XLSX.utils.aoa_to_sheet(distAoa);
  XLSX.utils.book_append_sheet(wb, wsOdp, 'ODP');
  XLSX.utils.book_append_sheet(wb, wsDist, 'Distribusi');

  const feederAoa = [['#','Nama','Tipe','Panjang (m)']];
  let fidx = 0;
  state.feederLines.forEach(f => {
    const g = f.geometry;
    if (g.type === 'LineString') {
      const lenM = turf.length({type:'Feature', geometry:g}, {units:'kilometers'}) * 1000;
      const nm = (f.properties && f.properties.name) ? String(f.properties.name) : '';
      feederAoa.push([++fidx, nm, 'LineString', Number(lenM.toFixed(1))]);
    } else if (g.type === 'MultiLineString') {
      g.coordinates.forEach((coords) => {
        const lenM = turf.length({type:'Feature', geometry:{type:'LineString', coordinates: coords}}, {units:'kilometers'}) * 1000;
        const nm = (f.properties && f.properties.name) ? String(f.properties.name) : '';
        feederAoa.push([++fidx, nm, 'MultiLineString seg', Number(lenM.toFixed(1))]);
      });
    }
  });
  const wsFeeder = XLSX.utils.aoa_to_sheet(feederAoa);
  XLSX.utils.book_append_sheet(wb, wsFeeder, 'Feeder');

  return wb;
}

if (exportXlsxBtn) {
  exportXlsxBtn.addEventListener('click', () => {
    try {
      const wb = buildWorkbook();
      const fname = safeName('output.xlsx', 'enhanced', 'xlsx');
      XLSX.writeFile(wb, fname);
    } catch (err) {
      console.error('Gagal membuat XLSX', err);
      alert('Gagal membuat file XLSX: ' + err.message);
    }
  });
}