/* Smart Map Logic - ESF 26 Carisma Manager */

let map;
let markersLayer = L.layerGroup(); // Individual markers for filtering
let markerClusterGroup = L.markerClusterGroup({
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true,
    maxClusterRadius: 40
});
let microAreasLayer = L.featureGroup();
let manualPoisLayer = L.layerGroup();
let autoPoisLayer = L.layerGroup();
let importedLayersGroup = L.featureGroup();
let editLayer = L.featureGroup();
let drawControl;
let editControl;
let geocodingCache = JSON.parse(localStorage.getItem('carisma_map_geocache') || '{}');
let microAreasData = JSON.parse(localStorage.getItem('carisma_map_microareas') || '[]');
let importedLayers = JSON.parse(localStorage.getItem('carisma_map_imported_layers') || '[]');
let currentEditingLayer = null;
let currentEditingFeature = null;
let editingMode = false;

// Map Configuration
const MAP_CENTER = [-22.1985, -54.7865];
const MAP_ZOOM = 17; // Closer default zoom

function initMap() {
    if (map) return;

    map = L.map('map-container', {
        maxZoom: 22,
        minZoom: 12,
        zoomSnap: 0.5
    }).setView(MAP_CENTER, MAP_ZOOM);

    map.zoomControl.setPosition('topright');

    // Base Layers
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 22,
        maxNativeZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
    });

    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 22,
        maxNativeZoom: 18,
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EBP, and the GIS User Community'
    });

    const baseMaps = {
        "Mapa de Ruas": osm,
        "Satélite (Alta Definição)": satellite
    };

    osm.addTo(map);

    // Layer Control for switching backgrounds
    const overlayMaps = {
        "Microáreas": microAreasLayer,
        "Domicílios/Pacientes": markerClusterGroup,
        "Pontos de Interesse": manualPoisLayer,
        "Pontos Automáticos": autoPoisLayer
    };
    
    // Adicionar camadas importadas ao controle
    importedLayers.forEach((layer, index) => {
        overlayMaps[layer.name] = importedLayersGroup;
    });
    
    L.control.layers(baseMaps, overlayMaps, { position: 'topright', collapsed: true }).addTo(map);

    markersLayer.addTo(map);
    markerClusterGroup.addTo(map);
    microAreasLayer.addTo(map);
    manualPoisLayer.addTo(map);
    autoPoisLayer.addTo(map);
    importedLayersGroup.addTo(map);
    editLayer.addTo(map);

    // Ferramenta de edição
    initEditTool();

    // Initial layers
    renderUBS();
    renderSavedPOIs();
    renderMicroAreas();
    initDrawingTool();
    initImportedLayers();

    // Load data
    refreshMapData();
    fetchOverpassPOIs();

    // Listen for moves to load more POIs
    map.on('moveend', () => {
        fetchOverpassPOIs();
    });
}

function centerMap() {
    map.setView(MAP_CENTER, MAP_ZOOM);
}

// ── PATIENT DATA & MARKERS ───────────────────────────────────

let isGeocoding = false;

async function refreshMapData() {
    if (isGeocoding) return;
    const patients = JSON.parse(localStorage.getItem('carisma_pessoas') || '[]');
    const totalPatients = patients.length;

    isGeocoding = true;
    markersLayer.clearLayers();
    markerClusterGroup.clearLayers();

    document.getElementById('map-stat-geo').textContent = `Carregando...`;

    const validPatients = patients.filter(p => p.rua);
    let geoCount = 0;

    // Mapa de agrupamento por endereço EXATO (rua + numero)
    const addressGroups = new Map();

    for (let i = 0; i < validPatients.length; i++) {
        const p = validPatients[i];
        
        // Chave de agrupamento: rua + numero EXATOS (não agrupa se numero for diferente)
        const addrKey = `${p.rua}, ${p.numero || ''}, ${p.bairro || 'Dourados'}, Dourados, MS, Brasil`;
        const groupKey = `${p.rua.toLowerCase().trim()}|${(p.numero || '').toLowerCase().trim()}`;
        
        let coords = await getCoordinates(addrKey);

        if (coords && coords !== 'NOT_FOUND') {
            // Se já existe alguém com MESMO endereço (rua + numero), agrupa
            if (addressGroups.has(groupKey)) {
                const existing = addressGroups.get(groupKey);
                existing.patients.push(p);
            } else {
                addressGroups.set(groupKey, {
                    coords: coords,
                    patients: [p],
                    address: addrKey
                });
            }
            geoCount++;
        }
    }

    // Adiciona todos os grupos ao mapa
    addressGroups.forEach((groupData, groupKey) => {
        addGroupMarker(groupData.patients, groupData.coords, [groupData.address]);
});

    document.getElementById('map-stat-geo').textContent = `${geoCount}/${validPatients.length}`;

    isGeocoding = false;
    saveGeoCache();
}

function updateMarkerPopup(marker) {
    const group = marker.patientDataGroup;
    const addresses = Array.from(marker.addressSet || []);
    
    let color = '#8B5CF6';
    const hasAtrasado = group.some(p => p.proximaDose && new Date(p.proximaDose) < new Date());
    const hasGestante = group.some(p => (p.tags || []).includes('Gestante'));
    const hasCronico = group.some(p => (p.tags || []).includes('Diabético') || (p.tags || []).includes('Hipertenso'));

    if (hasAtrasado) color = '#EF4444';
    else if (hasGestante) color = '#EC4899';
    else if (hasCronico) color = '#3B82F6';

    marker.setIcon(L.divIcon({
        className: 'custom-div-icon',
        html: `<div style="background-color:${color};" class="marker-pin"><i>${group.length}</i></div>`,
        iconSize: [30, 42],
        iconAnchor: [15, 42]
    }));

    const patientsListHtml = group.map(p => {
        const pTags = p.tags || [];
        const isAtrasado = p.proximaDose && new Date(p.proximaDose) < new Date();
        const tagsHtml = pTags.map(t => {
            let cls = '';
            if (t === 'Gestante') cls = 'tag-gestante';
            else if (t === 'Diabético' || t === 'Hipertenso') cls = 'tag-cronico';
            return `<span class="map-popup-tag ${cls}">${t}</span>`;
        }).join(' ');

        return `
            <div style="margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px;">
                <div style="font-weight:700; color:var(--primary);">${p.nome}</div>
                <div style="font-size:0.75rem;">MA: ${p.microArea || '—'} | ${p.rua}, ${p.numero || 'SN'} | ${tagsHtml}</div>
                ${isAtrasado ? '<div class="map-popup-tag tag-atrasado" style="font-size:0.65rem;">⚠️ Atrasado</div>' : ''}
                <a href="#" style="font-size:0.7rem; color:var(--primary); text-decoration:underline;" onclick="abrirPerfilCC_Map('${p.id}')">Ver Perfil</a>
            </div>
        `;
    }).join('');

    const addrStr = addresses.length > 0 ? addresses.join(' / ') : (group[0].rua + ', ' + (group[0].numero || 'S/N'));

    marker.bindPopup(`
        <div class="map-popup-card" style="max-height: 300px; overflow-y: auto;">
            <div style="font-size:0.75rem; color:#666; margin-bottom:8px;">🏠 ${addrStr}</div>
            ${patientsListHtml}
        </div>
    `);
}

async function getCoordinates(address) {
    const normAddr = address.toLowerCase().trim();
    if (geocodingCache[normAddr]) return geocodingCache[normAddr];

    // Respect Nominatim policy (max 1 req/sec) + safety margin
    await new Promise(resolve => setTimeout(resolve, 1200));

    try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`;
        const response = await fetch(url, {
            headers: { 'User-Agent': 'ESF26-Carisma-Manager/1.1' }
        });

        if (response.status === 403 || response.status === 429) {
            console.warn('Nominatim rate limit hit or blocked.');
            return null;
        }

        const data = await response.json();

        if (data && data.length > 0) {
            const coords = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
            geocodingCache[normAddr] = coords;
            saveGeoCache(); // Incremental save
            return coords;
        } else {
            // Negative caching to avoid re-searching failed addresses
            geocodingCache[normAddr] = 'NOT_FOUND';
            saveGeoCache();
            return 'NOT_FOUND';
        }
    } catch (e) {
        console.error('Geocoding error for:', address, e);
    }
    return null;
}

function saveGeoCache() {
    try {
        localStorage.setItem('carisma_map_geocache', JSON.stringify(geocodingCache));
    } catch (e) {
        console.error('Failed to save geocache to localStorage (likely quota full):', e);
        // If quota is full, we might need to purge old/less used entries, 
        // but for now we just log it.
    }
}

function addGroupMarker(groupPatients, coords, addresses = []) {
    // Determine priority color based on the group
    let color = '#8B5CF6'; // Default (Violet/Ruivo)
    const hasAtrasado = groupPatients.some(p => p.proximaDose && new Date(p.proximaDose) < new Date());
    const hasGestante = groupPatients.some(p => (p.tags || []).includes('Gestante'));
    const hasCronico = groupPatients.some(p => (p.tags || []).includes('Diabético') || (p.tags || []).includes('Hipertenso'));

    if (hasAtrasado) color = '#EF4444';
    else if (hasGestante) color = '#EC4899';
    else if (hasCronico) color = '#3B82F6';

    const icon = L.divIcon({
        className: 'custom-div-icon',
        html: `<div style="background-color:${color};" class="marker-pin"><i>${groupPatients.length}</i></div>`,
        iconSize: [30, 42],
        iconAnchor: [15, 42]
    });

    const marker = L.marker(coords, { icon });

    // Build popup with multiple patients
    let patientsListHtml = groupPatients.map(p => {
        const pTags = p.tags || [];
        const isAtrasado = p.proximaDose && new Date(p.proximaDose) < new Date();
        const tagsHtml = pTags.map(t => {
            let cls = '';
            if (t === 'Gestante') cls = 'tag-gestante';
            else if (t === 'Diabético' || t === 'Hipertenso') cls = 'tag-cronico';
            return `<span class="map-popup-tag ${cls}">${t}</span>`;
        }).join(' ');

        return `
            <div style="margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px;">
                <div style="font-weight:700; color:var(--primary);">${p.nome}</div>
                <div style="font-size:0.75rem;">MA: ${p.microArea || '—'} | ${p.rua}, ${p.numero || 'SN'} | ${tagsHtml}</div>
                ${isAtrasado ? '<div class="map-popup-tag tag-atrasado" style="font-size:0.65rem;">⚠️ Atrasado</div>' : ''}
                <a href="#" style="font-size:0.7rem; color:var(--primary); text-decoration:underline;" onclick="abrirPerfilCC_Map('${p.id}')">Ver Perfil</a>
            </div>
        `;
    }).join('');

    const addrStr = addresses.length > 0 ? addresses.join(' / ') : (groupPatients[0].rua + ', ' + (groupPatients[0].numero || 'S/N'));

    marker.bindPopup(`
        <div class="map-popup-card" style="max-height: 250px; overflow-y: auto;">
            <div style="font-size:0.75rem; color:#666; margin-bottom:8px;">🏠 ${addrStr}</div>
            ${patientsListHtml}
        </div>
    `);

    marker.patientDataGroup = groupPatients;
    marker.addressSet = new Set(addresses);
    markersLayer.addLayer(marker);
    markerClusterGroup.addLayer(marker);
}

// Global function to open profile from map
window.abrirPerfilCC_Map = (id) => {
    if (typeof window.abrirPerfilCC === 'function') {
        window.abrirPerfilCC(id);
    } else {
        alert('Perfil do paciente não disponível nesta tela.');
    }
};

// ── LAYERS & FILTERS ──────────────────────────────────────────

function toggleLayer() {
    const checkGestantes = document.querySelector('input[onchange*="gestantes"]')?.checked;
    const checkCronicos = document.querySelector('input[onchange*="cronicos"]')?.checked;
    const checkRisco = document.querySelector('input[onchange*="risco"]')?.checked;
    const checkBase = document.querySelector('input[onchange*="domicilios"]')?.checked;

    markerClusterGroup.clearLayers();

    markersLayer.eachLayer(marker => {
        const group = marker.patientDataGroup;
        let visible = false;

        if (checkGestantes && group.some(p => (p.tags || []).includes('Gestante'))) visible = true;
        if (checkCronicos && group.some(p => (p.tags || []).includes('Diabético') || (p.tags || []).includes('Hipertenso'))) visible = true;
        if (checkRisco && group.some(p => p.risco === 'Alto')) visible = true;
        if (checkBase && !visible) visible = true;

        if (visible) {
            markerClusterGroup.addLayer(marker);
        }
    });
}

// ── MICRO-AREAS & POIs ──────────────────────────────────────
let manualPoiMarker = null;
let savedPOIs = JSON.parse(localStorage.getItem('carisma_map_pois') || '[]');

const POI_ICONS = {
    school: '🏫',
    church: '⛪',
    market: '🏬',
    unei: '🏛️',
    other: '📍'
};

function initMapLayers() {
    // Deprecated in favor of initMap logic
}

function renderUBS() {
    // UBS ESF 26 Jardim Carisma approximate location
    const UBS_COORDS = [-22.2015, -54.7875];
    const ubsIcon = L.divIcon({
        className: 'custom-div-icon',
        html: `<div style="background-color:#000; border:2px solid #FFD700;" class="marker-pin"><i>🏥</i></div>`,
        iconSize: [36, 48],
        iconAnchor: [18, 48]
    });

    L.marker(UBS_COORDS, { icon: ubsIcon, zIndexOffset: 1000 })
        .bindPopup('<strong>🏥 UBS ESF 26 - Jardim Carisma</strong><br>Sede do nosso território.')
        .addTo(map); // Add directly to map, not clustered
}

// ── MANUAL POIs ──────────────────────────────────────────

function togglePOIEditor() {
    const controls = document.getElementById('poi-controls');
    if (controls.style.display === 'none') {
        controls.style.display = 'block';
        map.on('click', onMapClickForPOI);
        map.getContainer().style.cursor = 'crosshair';
        alert('Clique no mapa para marcar o novo ponto de interesse.');
    } else {
        controls.style.display = 'none';
        map.off('click', onMapClickForPOI);
        map.getContainer().style.cursor = '';
        if (manualPoiMarker) map.removeLayer(manualPoiMarker);
    }
}

function onMapClickForPOI(e) {
    if (manualPoiMarker) map.removeLayer(manualPoiMarker);
    manualPoiMarker = L.marker(e.latlng, { draggable: true }).addTo(map);
}

function saveManualPOI() {
    const name = document.getElementById('poi-name').value;
    const type = document.getElementById('poi-type').value;

    if (!name || !manualPoiMarker) {
        alert('Por favor, dê um nome e clique no mapa.');
        return;
    }

    const { lat, lng } = manualPoiMarker.getLatLng();
    const newPoi = { id: Date.now(), name, type, coords: [lat, lng], manual: true };

    savedPOIs.push(newPoi);
    localStorage.setItem('carisma_map_pois', JSON.stringify(savedPOIs));

    addPoiMarker(newPoi, true);
    togglePOIEditor();

    document.getElementById('poi-name').value = '';
    alert('Ponto de interesse salvo com sucesso!');
}

function renderSavedPOIs() {
    savedPOIs.forEach(poi => addPoiMarker(poi, true));
}

function addPoiMarker(poi, isManual = false) {
    const icon = L.divIcon({
        className: 'poi-marker',
        html: `<div class="poi-icon-wrap" style="background:#fff; border:2px solid ${isManual ? '#EC4899' : '#8B5CF6'}; border-radius:50%; width:32px; height:32px; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 5px rgba(0,0,0,0.2); font-size:18px;">${POI_ICONS[poi.type] || '📍'}</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
    });

    const targetLayer = isManual ? manualPoisLayer : autoPoisLayer;

    L.marker(poi.coords, { icon })
        .bindPopup(`<strong>${poi.name}</strong><br>${poi.manual ? '(Identificado em campo)' : '(Base de Dados OpenStreetMap)'}`)
        .addTo(targetLayer);
}

// ── AUTOMATIC POIs (OPENSTREETMAP/OVERPASS) ──────────────────

async function fetchOverpassPOIs() {
    try {
        const bounds = map.getBounds();
        const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;

        const query = `
            [out:json][timeout:25];
            (
              node["amenity"~"school|place_of_worship|marketplace|public_building"](${bbox});
              way["amenity"~"school|place_of_worship|marketplace|public_building"](${bbox});
            );
            out center;`;

        const response = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
        const data = await response.json();

        autoPoisLayer.clearLayers();
        data.elements.forEach(el => {
            const amen = el.tags.amenity;
            const type = mapOsmTypeToPoi(amen);
            const poi = {
                name: el.tags.name || (type === 'school' ? 'Escola' : type === 'church' ? 'Igreja' : 'Local'),
                type: type,
                coords: [el.lat || el.center.lat, el.lon || el.center.lon],
                manual: false
            };
            addPoiMarker(poi, false);
        });
    } catch (e) {
        console.warn('Overpass API error:', e);
    }
}

function mapOsmTypeToPoi(amenity) {
    if (amenity === 'school' || amenity === 'kindergarten') return 'school';
    if (amenity === 'place_of_worship') return 'church';
    if (amenity === 'marketplace' || amenity === 'pharmacy' || amenity === 'supermarket') return 'market';
    return 'other';
}

// ── EDIÇÃO DE POLÍGONOS IMPORTADOS ─────────────────────────────

function initEditTool() {
    editControl = new L.Control.Draw({
        draw: {
            polygon: true,
            polyline: false,
            rectangle: false,
            circle: false,
            marker: false,
            circlemarker: false
        },
        edit: {
            featureGroup: editLayer,
            remove: true
        }
    });
}

function toggleEditTool() {
    const controls = document.getElementById('edit-controls');
    if (controls.style.display === 'none') {
        controls.style.display = 'block';
        map.addControl(editControl);
    } else {
        controls.style.display = 'none';
        map.removeControl(editControl);
        editLayer.clearLayers();
    }
}

let pendingEditPolygon = null;

function startEditPolygon(layerIndex, featureIndex) {
    const feature = importedLayers[layerIndex].features[featureIndex];
    if (feature.type !== 'polygon') {
        alert('Apenas polígonos podem ser editados.');
        return;
    }
    
    editLayer.clearLayers();
    
    const polygon = L.polygon(feature.coords, {
        color: feature.color,
        fillColor: feature.color,
        fillOpacity: 0.3,
        weight: 2
    });
    
    polygon.editing.enable();
    editLayer.addLayer(polygon);
    
    pendingEditPolygon = { layerIndex, featureIndex };
    
    map.fitBounds(polygon.getBounds(), { padding: [50, 50] });
    
    alert('Modo de edição ativado!\n\nArraste os vértices para ajustar o formato.\nClique em "Salvar Alterações" quando terminar.');
}

function saveEditedPolygon() {
    if (!pendingEditPolygon) {
        alert('Nenhum polígono em edição.');
        return;
    }
    
    const layers = editLayer.getLayers();
    if (layers.length === 0) {
        alert('Desenhe um polígono primeiro.');
        return;
    }
    
    const editedLayer = layers[0];
    const newCoords = editedLayer.getLatLngs()[0].map(latlng => [latlng.lat, latlng.lng]);
    
    importedLayers[pendingEditPolygon.layerIndex].features[pendingEditPolygon.featureIndex].coords = newCoords;
    
    saveImportedLayers();
    renderImportedLayers();
    
    editLayer.clearLayers();
    pendingEditPolygon = null;
    
    alert('Polígono atualizado com sucesso!');
}

function cancelEditPolygon() {
    editLayer.clearLayers();
    pendingEditPolygon = null;
    alert('Edição cancelada.');
}

function deleteAndRedrawPolygon(layerIndex, featureIndex) {
    if (confirm('Excluir este polígono e desenhar um novo?')) {
        importedLayers[layerIndex].features.splice(featureIndex, 1);
        
        currentEditingLayer = layerIndex;
        saveImportedLayers();
        renderImportedLayers();
        
        toggleDrawingTool();
        alert('Polígono excluído. Desenhe o novo polígono no mapa.');
    }
}

function duplicatePolygon(layerIndex, featureIndex) {
    const feature = importedLayers[layerIndex].features[featureIndex];
    if (!feature) return;
    
    const newName = prompt('Nome do novo polígono (cópia):', feature.name + ' (cópia)');
    if (!newName) return;
    
    const offset = 0.0001;
    const newCoords = feature.coords.map(coord => [coord[0] + offset, coord[1] + offset]);
    
    importedLayers[layerIndex].features.push({
        type: feature.type,
        name: newName,
        coords: newCoords,
        color: feature.color
    });
    
    saveImportedLayers();
    renderImportedLayers();
    
    alert('Polígono duplicado! Você pode editar a cópia agora.');
}

function movePolygonToLayer(layerIndex, featureIndex, targetLayerIndex) {
    const feature = importedLayers[layerIndex].features[featureIndex];
    if (!feature) return;
    
    importedLayers[layerIndex].features.splice(featureIndex, 1);
    importedLayers[targetLayerIndex].features.push(feature);
    
    saveImportedLayers();
    renderImportedLayers();
    
    alert('Polígono movido para "' + importedLayers[targetLayerIndex].name + '"');
}

function zoomToLayer(layerIndex) {
    const layer = importedLayers[layerIndex];
    if (!layer || layer.features.length === 0) {
        alert('Esta camada está vazia.');
        return;
    }
    
    let allCoords = [];
    layer.features.forEach(f => {
        if (f.type === 'polygon') {
            allCoords = allCoords.concat(f.coords);
        } else if (f.type === 'marker') {
            allCoords.push(f.coords);
        } else if (f.type === 'polyline') {
            allCoords = allCoords.concat(f.coords);
        }
    });
    
    if (allCoords.length === 0) {
        alert('Nenhuma geometria encontrada nesta camada.');
        return;
    }
    
    const bounds = L.latLngBounds(allCoords);
    map.fitBounds(bounds, { padding: [50, 50] });
}

function zoomToAllLayers() {
    let allCoords = [];
    importedLayers.forEach(layer => {
        if (!layer.visible) return;
        layer.features.forEach(f => {
            if (f.type === 'polygon') {
                allCoords = allCoords.concat(f.coords);
            } else if (f.type === 'marker') {
                allCoords.push(f.coords);
            } else if (f.type === 'polyline') {
                allCoords = allCoords.concat(f.coords);
            }
        });
    });
    
    if (allCoords.length === 0) {
        alert('Nenhuma camada visível.');
        return;
    }
    
    const bounds = L.latLngBounds(allCoords);
    map.fitBounds(bounds, { padding: [50, 50] });
}

function exportLayerToKML(layerIndex) {
    const layer = importedLayers[layerIndex];
    if (!layer) return;
    
    let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
    <name>${layer.name}</name>
    <Style id="style-${layerIndex}">
        <LineStyle>
            <color>ff${layer.color.replace('#', '').split('').reverse().join('')}</color>
            <width>2</width>
        </LineStyle>
        <PolyStyle>
            <color>80${layer.color.replace('#', '').split('').reverse().join('')}</color>
            <fill>1</fill>
            <outline>1</outline>
        </PolyStyle>
    </Style>
`;
    
    layer.features.forEach((f, i) => {
        kml += `    <Placemark>
        <name>${f.name || 'Feature ' + (i+1)}</name>
        <styleUrl>#style-${layerIndex}</styleUrl>
`;
        if (f.type === 'polygon') {
            kml += `        <Polygon>
            <outerBoundaryIs>
                <LinearRing>
                    <coordinates>${f.coords.map(c => c[1] + ',' + c[0]).join(' ')}</coordinates>
                </LinearRing>
            </outerBoundaryIs>
        </Polygon>
`;
        } else if (f.type === 'marker') {
            kml += `        <Point>
            <coordinates>${f.coords[1]},${f.coords[0]}</coordinates>
        </Point>
`;
        } else if (f.type === 'polyline') {
            kml += `        <LineString>
            <coordinates>${f.coords.map(c => c[1] + ',' + c[0]).join(' ')}</coordinates>
        </LineString>
`;
        }
        kml += `    </Placemark>
`;
    });
    
    kml += `</Document>
</kml>`;
    
    const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${layer.name.replace(/[^a-z0-9]/gi, '_')}.kml`;
    a.click();
    URL.revokeObjectURL(url);
}

// ── MICRO-AREAS DRAWING ──────────────────────────────────────

function initDrawingTool() {
    drawControl = new L.Control.Draw({
        draw: {
            polygon: true,
            polyline: false,
            rectangle: false,
            circle: false,
            marker: false,
            circlemarker: false
        },
        edit: {
            featureGroup: microAreasLayer,
            remove: true
        }
    });

    map.on(L.Draw.Event.CREATED, function (e) {
        const layer = e.layer;
        microAreasLayer.addLayer(layer);
    });
}

function toggleDrawingTool() {
    const controls = document.getElementById('drawing-controls');
    const btnSavePolygon = document.getElementById('btn-save-polygon-layer');
    if (controls.style.display === 'none') {
        controls.style.display = 'block';
        if (currentEditingLayer !== null) {
            btnSavePolygon.style.display = 'inline-block';
        }
        map.addControl(drawControl);
    } else {
        controls.style.display = 'none';
        btnSavePolygon.style.display = 'none';
        map.removeControl(drawControl);
    }
}

function saveMicroArea() {
    const number = document.getElementById('ma-number').value;
    if (!number) {
        alert('Por favor, informe o número da microárea.');
        return;
    }

    const layers = microAreasLayer.getLayers();
    if (layers.length === 0) {
        alert('Desenhe o polígono da microárea primeiro.');
        return;
    }

    const lastLayer = layers[layers.length - 1];
    const geojson = lastLayer.toGeoJSON();
    geojson.properties = { microArea: number };

    microAreasData.push(geojson);
    localStorage.setItem('carisma_map_microareas', JSON.stringify(microAreasData));

    alert(`Microárea ${number} salva com sucesso!`);
}

function renderMicroAreas() {
    microAreasLayer.clearLayers();
    microAreasData.forEach(data => {
        L.geoJSON(data, {
            style: { color: '#8B5CF6', weight: 2, fillOpacity: 0.1 },
            onEachFeature: (feature, layer) => {
                layer.bindPopup(`<strong>Microárea ${feature.properties.microArea}</strong>`);
            }
        }).addTo(microAreasLayer);
    });
}

// Existing Micro-areas code adjusted for initialization
// initMap merged at start of file

// Integration with navigation
const originalNavTo = window.navTo;
window.navTo = function (pg) {
    if (typeof originalNavTo === 'function') originalNavTo(pg);
    if (pg === 'mapa') {
        setTimeout(initMap, 100);
    }
};

// ═══════════════════════════════════════════════════════════════
// KML IMPORT/EXPORT - Google My Maps Integration
// ═══════════════════════════════════════════════════════════════

function initImportedLayers() {
    importedLayersGroup = L.featureGroup();
    importedLayersGroup.addTo(map);
    renderImportedLayers();
}

function renderImportedLayers() {
    importedLayersGroup.clearLayers();
    
    importedLayers.forEach((layer, index) => {
        if (!layer.visible) return;
        
        layer.features.forEach(feature => {
            const featureColor = feature.color || layer.color || '#8B5CF6';
            
            if (feature.type === 'polygon') {
                const polygon = L.polygon(feature.coords, {
                    color: featureColor,
                    fillColor: featureColor,
                    fillOpacity: 0.25,
                    weight: 2
                });
                polygon.featureData = { layerIndex: index, featureIndex: layer.features.indexOf(feature) };
                polygon.bindPopup(`
                    <div style="min-width: 220px;">
                        <strong>${layer.name}</strong><br>
                        <em>${feature.name || 'Polígono'}</em><br>
                        <div style="margin: 10px 0; display: flex; align-items: center; gap: 8px;">
                            <span style="display:inline-block;width:20px;height:20px;background:${featureColor};border-radius:4px;border:1px solid #333;"></span>
                            <input type="color" value="${featureColor}" 
                                onchange="changeFeatureColor(${index}, ${layer.features.indexOf(feature)}, this.value)"
                                style="cursor:pointer; width:30px; height:30px; border:none; padding:0;">
                        </div>
                        <div style="display:flex; gap:4px; flex-wrap:wrap; margin-top:8px;">
                            <button onclick="startEditPolygon(${index}, ${layer.features.indexOf(feature)})" 
                                style="background:#3B82F6; color:white; border:none; padding:4px 8px; border-radius:3px; cursor:pointer; font-size:0.65rem;">✏️ Editar</button>
                            <button onclick="duplicatePolygon(${index}, ${layer.features.indexOf(feature)})" 
                                style="background:#8B5CF6; color:white; border:none; padding:4px 8px; border-radius:3px; cursor:pointer; font-size:0.65rem;">📋 Duplicar</button>
                            <button onclick="deleteAndRedrawPolygon(${index}, ${layer.features.indexOf(feature)})" 
                                style="background:#F59E0B; color:white; border:none; padding:4px 8px; border-radius:3px; cursor:pointer; font-size:0.65rem;">🔄 Redesenhar</button>
                            <button onclick="deleteImportedFeature(${index}, ${layer.features.indexOf(feature)})" 
                                style="background:#EF4444; color:white; border:none; padding:4px 8px; border-radius:3px; cursor:pointer; font-size:0.65rem;">🗑️</button>
                        </div>
                    </div>
                `);
                polygon.on('click', () => enablePolygonEdit(polygon, index, layer.features.indexOf(feature)));
                importedLayersGroup.addLayer(polygon);
            } else if (feature.type === 'marker') {
                const marker = L.marker(feature.coords, {
                    icon: L.divIcon({
                        className: 'imported-marker',
                        html: `<div style="background:${featureColor}; width:24px; height:24px; border-radius:50%; border:2px solid white; display:flex; align-items:center; justify-content:center; font-size:12px;">📍</div>`,
                        iconSize: [24, 24],
                        iconAnchor: [12, 12]
                    })
                });
                marker.featureData = { layerIndex: index, featureIndex: layer.features.indexOf(feature) };
                marker.bindPopup(`
                    <div style="min-width: 180px;">
                        <strong>${layer.name}</strong><br>
                        ${feature.name || 'Ponto'}<br>
                        <div style="margin: 10px 0; display: flex; align-items: center; gap: 8px;">
                            <span style="display:inline-block;width:20px;height:20px;background:${featureColor};border-radius:4px;border:1px solid #333;"></span>
                            <input type="color" value="${featureColor}" 
                                onchange="changeMarkerColor(${index}, ${layer.features.indexOf(feature)}, this.value)"
                                style="cursor:pointer; width:30px; height:30px; border:none; padding:0;">
                        </div>
                        <button onclick="deleteImportedFeature(${index}, ${layer.features.indexOf(feature)})" 
                            style="background:#EF4444; color:white; border:none; padding:4px 8px; border-radius:3px; cursor:pointer; font-size:0.7rem;">🗑️ Remover</button>
                    </div>
                `);
                marker.on('click', () => enableMarkerEdit(marker, index, layer.features.indexOf(feature)));
                importedLayersGroup.addLayer(marker);
            } else if (feature.type === 'polyline') {
                const polyline = L.polyline(feature.coords, {
                    color: featureColor,
                    weight: 3
                });
                polyline.featureData = { layerIndex: index, featureIndex: layer.features.indexOf(feature) };
                polyline.bindPopup(`
                    <div style="min-width: 180px;">
                        <strong>${layer.name}</strong><br>
                        <em>Linha</em><br>
                        <div style="margin: 10px 0; display: flex; align-items: center; gap: 8px;">
                            <span style="display:inline-block;width:20px;height:20px;background:${featureColor};border-radius:4px;border:1px solid #333;"></span>
                            <input type="color" value="${featureColor}" 
                                onchange="changeLineColor(${index}, ${layer.features.indexOf(feature)}, this.value)"
                                style="cursor:pointer; width:30px; height:30px; border:none; padding:0;">
                        </div>
                        <button onclick="deleteImportedFeature(${index}, ${layer.features.indexOf(feature)})" 
                            style="background:#EF4444; color:white; border:none; padding:4px 8px; border-radius:3px; cursor:pointer; font-size:0.7rem;">🗑️ Remover</button>
                    </div>
                `);
                importedLayersGroup.addLayer(polyline);
            }
        });
    });
    
    updateImportedLayersPanel();
}

function updateImportedLayersPanel() {
    const panel = document.getElementById('imported-layers-list');
    if (!panel) return;
    
    panel.innerHTML = importedLayers.map((layer, index) => `
        <div class="imported-layer-item" style="border-left: 4px solid ${layer.color}; padding: 8px; margin-bottom: 8px; background: #f9f9f9; border-radius: 4px;">
            <div style="display: flex; align-items: center; gap: 8px;">
                <input type="checkbox" ${layer.visible ? 'checked' : ''} onchange="toggleImportedLayer(${index})">
                <strong>${layer.name}</strong>
                <span style="font-size: 0.75rem; color: #666;">(${layer.features.length} ${layer.features[0]?.type === 'polygon' ? 'polígonos' : 'elementos'})</span>
            </div>
            <div style="margin-top: 5px; display: flex; gap: 4px; flex-wrap: wrap;">
                <button onclick="zoomToLayer(${index})" title="Centralizar nesta camada" style="font-size: 0.65rem; padding: 2px 6px; background: #3B82F6; color: white; border: none; border-radius: 3px; cursor: pointer;">🔍 Zoom</button>
                <button onclick="exportLayerToKML(${index})" title="Exportar para KML" style="font-size: 0.65rem; padding: 2px 6px; background: #8B5CF6; color: white; border: none; border-radius: 3px; cursor: pointer;">💾 Exportar</button>
                <button onclick="addFeatureToLayer(${index})" title="Adicionar elemento" style="font-size: 0.65rem; padding: 2px 6px; background: #10B981; color: white; border: none; border-radius: 3px; cursor: pointer;">+ Adicionar</button>
                <button onclick="deleteImportedLayer(${index})" title="Excluir camada" style="font-size: 0.65rem; padding: 2px 6px; background: #EF4444; color: white; border: none; border-radius: 3px; cursor: pointer;">🗑️</button>
            </div>
        </div>
    `).join('');
    
    if (importedLayers.length > 0) {
        panel.innerHTML += `
            <button onclick="zoomToAllLayers()" style="width: 100%; margin-top: 10px; padding: 8px; background: #0EA5E9; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.75rem;">
                🔍🔍 Zoom em Todas as Camadas
            </button>
        `;
    }
}

async function importKML() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.kml,.kmz';
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            let kmlText;
            if (file.name.toLowerCase().endsWith('.kmz')) {
                kmlText = await readKMZAsKML(file);
            } else {
                kmlText = await readFileAsText(file);
            }
            
            const kmlData = parseKML(kmlText);
            
            if (kmlData.length === 0) {
                alert('Nenhum dado encontrado no arquivo KML. Verifique se o arquivo contém polígonos ou pontos.');
                return;
            }
            
            importedLayers.push(...kmlData);
            saveImportedLayers();
            renderImportedLayers();
            
            alert(`✅ Importados ${kmlData.length} camada(s) com sucesso!\nClique em cada camada para editar.`);
        } catch (err) {
            console.error('Erro ao importar KML:', err);
            alert('Erro ao importar arquivo KML. Verifique se é um arquivo válido do Google My Maps.');
        }
    };
    
    input.click();
}

async function readKMZAsKML(kmzFile) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const arrayBuffer = e.target.result;
                const zip = await JSZip.loadAsync(arrayBuffer);
                const kmlFileName = Object.keys(zip.files).find(name => name.toLowerCase().endsWith('.kml'));
                
                if (kmlFileName) {
                    const kmlContent = await zip.file(kmlFileName).async('string');
                    resolve(kmlContent);
                } else {
                    reject(new Error('Arquivo KMZ não contém arquivo KML'));
                }
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(kmzFile);
    });
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

function parseKML(kmlText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(kmlText, 'text/xml');
    const layers = [];
    
    const folderElements = doc.querySelectorAll('Folder');
    const placemarkElements = doc.querySelectorAll('Placemark');
    
    const styleMap = {};
    doc.querySelectorAll('Style, StyleMap').forEach(style => {
        const id = style.getAttribute('id');
        if (id) {
            styleMap['#' + id] = style;
        }
        style.querySelectorAll('Style, StyleMap').forEach(inner => {
            const innerId = inner.getAttribute('id');
            if (innerId) {
                styleMap['#' + innerId] = inner;
            }
        });
    });
    
    console.log('StyleMap keys found:', Object.keys(styleMap));
    console.log('Total placemarks:', placemarkElements.length);
    
    function kmlColorToHex(kmlColor) {
        if (!kmlColor || kmlColor.length < 8) return null;
        try {
            const a = kmlColor.substr(0, 2);
            const b = kmlColor.substr(2, 2);
            const g = kmlColor.substr(4, 2);
            const r = kmlColor.substr(6, 2);
            return '#' + r + g + b;
        } catch {
            return null;
        }
    }
    
    function extractColorFromElement(element) {
        if (!element) return null;
        
        const colorEl = element.querySelector('color');
        if (colorEl && colorEl.textContent) {
            return kmlColorToHex(colorEl.textContent.trim());
        }
        
        const lineStyle = element.querySelector('LineStyle');
        if (lineStyle) {
            const c = lineStyle.querySelector('color');
            if (c && c.textContent) return kmlColorToHex(c.textContent.trim());
        }
        
        const polyStyle = element.querySelector('PolyStyle');
        if (polyStyle) {
            const c = polyStyle.querySelector('color');
            if (c && c.textContent) return kmlColorToHex(c.textContent.trim());
        }
        
        const iconStyle = element.querySelector('IconStyle');
        if (iconStyle) {
            const c = iconStyle.querySelector('color');
            if (c && c.textContent) return kmlColorToHex(c.textContent.trim());
        }
        
        return null;
    }
    
    function getStyleColor(styleUrl) {
        if (!styleUrl || !styleUrl.startsWith('#')) return null;
        const style = styleMap[styleUrl];
        if (!style) return null;
        
        if (style.tagName === 'StyleMap') {
            const pair = style.querySelector('Pair');
            const key = pair?.querySelector('key')?.textContent;
            const referencedStyle = pair?.querySelector('styleUrl')?.textContent;
            if (referencedStyle) return getStyleColor(referencedStyle);
        }
        
        return extractColorFromElement(style);
    }
    
    function getPlacemarkColor(placemark) {
        let color = extractColorFromElement(placemark);
        if (color) return color;
        
        const styleUrl = placemark.querySelector('styleUrl')?.textContent?.trim();
        if (styleUrl) {
            color = getStyleColor(styleUrl);
            if (color) return color;
        }
        
        const style = placemark.querySelector('Style');
        if (style) {
            color = extractColorFromElement(style);
            if (color) return color;
        }
        
        if (styleUrl) {
            const styleId = styleUrl.replace('#', '');
            const inlineStyle = doc.querySelector(`[id="${styleId}"]`);
            if (inlineStyle) {
                color = extractColorFromElement(inlineStyle);
                if (color) return color;
            }
        }
        
        return null;
    }
    
    if (folderElements.length > 0) {
        folderElements.forEach(folder => {
            const folderName = folder.querySelector('name')?.textContent?.trim() || 'Camada sem nome';
            let folderColor = extractColorFromElement(folder);
            if (!folderColor) folderColor = getStyleColor(folder.querySelector('styleUrl')?.textContent?.trim());
            if (!folderColor) folderColor = '#8B5CF6';
            
            const features = [];
            let defaultColor = folderColor;
            
            folder.querySelectorAll('Placemark').forEach(placemark => {
                const result = parsePlacemark(placemark, folderName);
                if (result) {
                    if (Array.isArray(result)) {
                        result.forEach(f => {
                            const placemarkColor = getPlacemarkColor(placemark);
                            f.color = placemarkColor || defaultColor;
                            features.push(f);
                        });
                    } else {
                        const placemarkColor = getPlacemarkColor(placemark);
                        result.color = placemarkColor || defaultColor;
                        features.push(result);
                    }
                }
            });
            
            if (features.length > 0) {
                layers.push({
                    id: 'kml_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                    name: folderName,
                    color: folderColor,
                    visible: true,
                    features: features
                });
            }
        });
    } else {
        const rootName = doc.querySelector('Document > name')?.textContent?.trim() || 'Camada Importada';
        let rootColor = extractColorFromElement(doc.querySelector('Document') || doc.documentElement);
        if (!rootColor) rootColor = '#8B5CF6';
        
        const features = [];
        
        placemarkElements.forEach(placemark => {
            const result = parsePlacemark(placemark, rootName);
            if (result) {
                if (Array.isArray(result)) {
                    result.forEach(f => {
                        const placemarkColor = getPlacemarkColor(placemark);
                        f.color = placemarkColor || rootColor;
                        features.push(f);
                    });
                } else {
                    const placemarkColor = getPlacemarkColor(placemark);
                    result.color = placemarkColor || rootColor;
                    features.push(result);
                }
            }
        });
        
        if (features.length > 0) {
            layers.push({
                id: 'kml_' + Date.now(),
                name: rootName,
                color: rootColor,
                visible: true,
                features: features
            });
        }
    }
    
    console.log('KML parsed:', layers.length, 'layers');
    return layers;
}

function parsePlacemark(placemark, layerName) {
    const name = placemark.querySelector('name')?.textContent?.trim() || '';
    
    const multiGeo = placemark.querySelector('MultiGeometry');
    if (multiGeo) {
        const features = [];
        multiGeo.querySelectorAll('Polygon, Point, LineString').forEach(geo => {
            if (geo.tagName === 'Polygon') {
                const coordinates = geo.querySelector('coordinates')?.textContent?.trim();
                if (coordinates) {
                    const coords = parseCoordinates(coordinates);
                    if (coords.length > 2) {
                        features.push({ type: 'polygon', name: name, coords: coords });
                    }
                }
            } else if (geo.tagName === 'Point') {
                const coordinates = geo.querySelector('coordinates')?.textContent?.trim();
                if (coordinates) {
                    const parts = coordinates.split(',');
                    const coords = [parseFloat(parts[1]), parseFloat(parts[0])];
                    features.push({ type: 'marker', name: name, coords: coords });
                }
            } else if (geo.tagName === 'LineString') {
                const coordinates = geo.querySelector('coordinates')?.textContent?.trim();
                if (coordinates) {
                    const coords = parseCoordinates(coordinates);
                    if (coords.length > 1) {
                        features.push({ type: 'polyline', name: name, coords: coords });
                    }
                }
            }
        });
        return features.length > 0 ? features : null;
    }
    
    const polygon = placemark.querySelector('Polygon');
    if (polygon) {
        const coordinates = polygon.querySelector('coordinates')?.textContent?.trim();
        if (coordinates) {
            const coords = parseCoordinates(coordinates);
            if (coords.length > 2) {
                return { type: 'polygon', name: name, coords: coords };
            }
        }
    }
    
    const point = placemark.querySelector('Point');
    if (point) {
        const coordinates = point.querySelector('coordinates')?.textContent?.trim();
        if (coordinates) {
            const parts = coordinates.split(',');
            const coords = [parseFloat(parts[1]), parseFloat(parts[0])];
            return { type: 'marker', name: name, coords: coords };
        }
    }
    
    const lineString = placemark.querySelector('LineString');
    if (lineString) {
        const coordinates = lineString.querySelector('coordinates')?.textContent?.trim();
        if (coordinates) {
            const coords = parseCoordinates(coordinates);
            if (coords.length > 1) {
                return { type: 'polyline', name: name, coords: coords };
            }
        }
    }
    
    return null;
}

function parseCoordinates(coordString) {
    return coordString.split(' ').map(coord => {
        const parts = coord.trim().split(',');
        if (parts.length >= 2) {
            return [parseFloat(parts[1]), parseFloat(parts[0])];
        }
        return null;
    }).filter(c => c !== null);
}

function toggleImportedLayer(index) {
    importedLayers[index].visible = !importedLayers[index].visible;
    saveImportedLayers();
    renderImportedLayers();
}

function deleteImportedLayer(index) {
    if (confirm(`Excluir camada "${importedLayers[index].name}" e todos seus elementos?`)) {
        importedLayers.splice(index, 1);
        saveImportedLayers();
        renderImportedLayers();
    }
}

function deleteImportedFeature(layerIndex, featureIndex) {
    importedLayers[layerIndex].features.splice(featureIndex, 1);
    if (importedLayers[layerIndex].features.length === 0) {
        importedLayers.splice(layerIndex, 1);
    }
    saveImportedLayers();
    renderImportedLayers();
    map.closePopup();
}

function addFeatureToLayer(index) {
    const choice = prompt('Adicionar:\n1 = Ponto (clique no mapa)\n2 = Polígono (desenhe no mapa)\n\nDigite 1 ou 2:');
    
    if (choice === '1') {
        if (confirm('Clique no mapa para adicionar um ponto nesta camada.')) {
            editingMode = true;
            currentEditingLayer = index;
            currentEditingFeature = null;
            map.on('click', addPointToLayer);
            map.getContainer().style.cursor = 'crosshair';
        }
    } else if (choice === '2') {
        currentEditingLayer = index;
        alert('Desenhe o polígono no mapa. Clique no botão "📥 Salvar na Camada" quando terminar.');
        toggleDrawingTool();
    }
}

function saveAsPolygonToLayer() {
    if (currentEditingLayer === null) return;
    
    const layers = microAreasLayer.getLayers();
    if (layers.length === 0) {
        alert('Desenhe um polígono primeiro!');
        return;
    }
    
    const lastLayer = layers[layers.length - 1];
    const geojson = lastLayer.toGeoJSON();
    
    if (geojson.geometry.type !== 'Polygon') {
        alert('Selecione um polígono (forma fechada).');
        return;
    }
    
    const name = prompt('Nome deste polígono (ex: Microárea 01):') || 'Polígono';
    
    importedLayers[currentEditingLayer].features.push({
        type: 'polygon',
        name: name,
        coords: geojson.geometry.coordinates[0],
        color: importedLayers[currentEditingLayer].color
    });
    
    microAreasLayer.clearLayers();
    saveImportedLayers();
    renderImportedLayers();
    
    alert('Polígono adicionado à camada!');
}

function addPointToLayer(e) {
    if (!editingMode || currentEditingLayer === null) return;
    
    map.off('click', addPointToLayer);
    map.getContainer().style.cursor = '';
    editingMode = false;
    
    const name = prompt('Nome do ponto (opcional):') || 'Ponto sem nome';
    
    importedLayers[currentEditingLayer].features.push({
        type: 'marker',
        name: name,
        coords: [e.latlng.lat, e.latlng.lng]
    });
    
    saveImportedLayers();
    renderImportedLayers();
}

function enableMarkerEdit(marker, layerIndex, featureIndex) {
    currentEditingLayer = layerIndex;
    currentEditingFeature = featureIndex;
    
    const newLatLng = prompt('Nova latitude:', marker.getLatLng().lat) + ',' + prompt('Nova longitude:', marker.getLatLng().lng);
    if (newLatLng) {
        const parts = newLatLng.split(',');
        if (parts.length === 2) {
            const newLat = parseFloat(parts[0].trim());
            const newLng = parseFloat(parts[1].trim());
            
            if (!isNaN(newLat) && !isNaN(newLng)) {
                importedLayers[layerIndex].features[featureIndex].coords = [newLat, newLng];
                saveImportedLayers();
                renderImportedLayers();
            }
        }
    }
}

function enablePolygonEdit(polygon, layerIndex, featureIndex) {
    currentEditingLayer = layerIndex;
    currentEditingFeature = featureIndex;
    
    const coords = polygon.getLatLngs()[0];
    let coordString = coords.map(c => `${c.lng},${c.lat}`).join(' ');
    
    const newCoordsStr = prompt('Novas coordenadas (formato: lng,lat lng,lat...):', coordString);
    if (newCoordsStr) {
        const newCoords = newCoordsStr.trim().split(' ').map(c => {
            const parts = c.split(',');
            return [parseFloat(parts[1]), parseFloat(parts[0])];
        }).filter(c => !isNaN(c[0]) && !isNaN(c[1]));
        
        if (newCoords.length > 2) {
            importedLayers[layerIndex].features[featureIndex].coords = newCoords;
            saveImportedLayers();
            renderImportedLayers();
        }
    }
}

function saveImportedLayers() {
    localStorage.setItem('carisma_map_imported_layers', JSON.stringify(importedLayers));
}

function clearAllImportedLayers() {
    if (confirm('Limpar TODAS as camadas importadas? Esta ação não pode ser desfeita.')) {
        importedLayers = [];
        saveImportedLayers();
        renderImportedLayers();
        alert('Todas as camadas importadas foram removidas.');
    }
}

function changeFeatureColor(layerIndex, featureIndex, newColor) {
    importedLayers[layerIndex].features[featureIndex].color = newColor;
    saveImportedLayers();
    renderImportedLayers();
}

function changeMarkerColor(layerIndex, featureIndex, newColor) {
    importedLayers[layerIndex].features[featureIndex].color = newColor;
    saveImportedLayers();
    renderImportedLayers();
}

function changeLineColor(layerIndex, featureIndex, newColor) {
    importedLayers[layerIndex].features[featureIndex].color = newColor;
    saveImportedLayers();
    renderImportedLayers();
}

function createNewLayer() {
    const name = prompt('Nome da nova camada (ex: Microáreas):');
    if (!name) return;
    
    const color = prompt('Cor em hex (ex: #FF5733):', '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0'));
    
    importedLayers.push({
        id: 'layer_' + Date.now(),
        name: name,
        color: color || '#8B5CF6',
        visible: true,
        features: []
    });
    
    saveImportedLayers();
    renderImportedLayers();
    alert('Camada criada! Clique em "+ Adicionar" na lista de camadas para desenhar polígonos.');
}

// Make functions globally accessible
window.importKML = importKML;
window.toggleImportedLayer = toggleImportedLayer;
window.deleteImportedLayer = deleteImportedLayer;
window.deleteImportedFeature = deleteImportedFeature;
window.addFeatureToLayer = addFeatureToLayer;
window.enableMarkerEdit = enableMarkerEdit;
window.enablePolygonEdit = enablePolygonEdit;
window.clearAllImportedLayers = clearAllImportedLayers;
window.changeFeatureColor = changeFeatureColor;
window.changeMarkerColor = changeMarkerColor;
window.changeLineColor = changeLineColor;
window.createNewLayer = createNewLayer;
window.saveAsPolygonToLayer = saveAsPolygonToLayer;
window.toggleEditTool = toggleEditTool;
window.startEditPolygon = startEditPolygon;
window.saveEditedPolygon = saveEditedPolygon;
window.cancelEditPolygon = cancelEditPolygon;
window.deleteAndRedrawPolygon = deleteAndRedrawPolygon;
window.duplicatePolygon = duplicatePolygon;
window.movePolygonToLayer = movePolygonToLayer;
window.zoomToLayer = zoomToLayer;
window.zoomToAllLayers = zoomToAllLayers;
window.exportLayerToKML = exportLayerToKML;
