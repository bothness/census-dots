// API url
const url = [
  './data/',
  '.csv'
];
const api = 'https://pmd3-production-drafter-onsgeo.publishmydata.com/v1/sparql/live?query=';

// DOM elements
const spinner = document.getElementById('loader');
const selector = document.getElementById('selector');
const legend = document.getElementById('legend');
const units = document.getElementById('units');
const count = document.getElementById('count');
const form = document.getElementById('form');
const postcode = document.getElementById('postcode');

// Colors and options
const colors = [
  'rgb(43, 175, 219)',
  'rgb(234, 56, 179)',
  'rgb(43, 225, 179)',
  'rgb(232, 241, 47)',
  'rgb(247, 93, 43)'
];

const options = {
  'Ethnicity': 'ethnicity',
  'Social grade': 'class',
  'Hours worked': 'hours',
  'Housing type': 'home',
  'Housing tenure': 'tenure'
};

const unitise = {
  'ethnicity': 'people',
  'class': 'people',
  'hours': 'workers',
  'home': 'homes',
  'tenure': 'homes'
};

// Set null variables
var data = {
  'headers': [],
  'values': {},
  'totals': [],
  'perc': [],
};
var store = {};

// Create popup class for map tooltips
var popup = new mapboxgl.Popup({
  closeButton: false,
  closeOnClick: false
});

// Function to turn CSV (string) into array of objects
function tsv2json(string) {
  let json = {
    'headers': [],
    'values': {},
    'totals': [],
    'perc': [],
  };
  string = string.replace(/['"]+/g, '');
  let array = string.split('\n');
  let headers = array[0].split(',');
  headers.shift();
  json.headers = headers;
  for (i in headers) {
    json.totals.push(0);
  }
  for (var i = 1; i < array.length; i++) {
    let row = array[i].split(',');
    if (row[1]) {
      let tot = 0;
      let counts = [];
      let breaks = [];
      for (j = 1; j < row.length; j++) {
        let val = +row[j];
        tot += Math.round(val / 10);
        counts.push(val);
        breaks.push(tot);
        json.totals[j - 1] += val;
      }
      json.values[row[0]] = {
        'counts': counts,
        'breaks': breaks
      }
    }
  }
  let sum = 0;
  for (tot in json.totals) {
    sum += json.totals[tot];
  }
  for (tot in json.totals) {
    let perc = Math.round(100 * (json.totals[tot] / sum));
    json.perc.push(perc);
  }
  return json;
}

// Function to convert JSON to GeoJSON
function json2geo(json) {
  let geojson = {
    "type": "FeatureCollection",
    "features": []
  };
  for (i in json) {
    let feature = {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [+json[i].lng, +json[i].lat]
      },
      "properties": {
        "code": json[i].code
      }
    };
    geojson.features.push(feature);
  }
  return geojson;
}

// Function to get data
function getData(dim) {
  spinner.style.display = 'flex';
  let dataurl = url[0] + dim + url[1];
  if (!store[dim]) {
    fetch(dataurl)
      .then((response) => {
        return response.text();
      })
      .then((tsvdata) => {
        return tsv2json(tsvdata);
      })
      .then((newdata) => {
        data = newdata;
        store[dim] = newdata;
        genLegend(data);
        clearDots();
        updateDots();
        units.innerHTML = unitise[dim];
        spinner.style.display = 'none';
        return true;
      });
  } else {
    data = store[dim];
    genLegend(data);
    clearDots();
    updateDots();
    units.innerHTML = unitise[dim];
    spinner.style.display = 'none';
  }
}

// Function to get color for a value based on breaks
function getColor(value, breaks) {
  for (i in breaks) {
    if (value < breaks[i]) {
      if (document.getElementById('legend' + i).checked) {
        return [colors[i], i];
      } else {
        return [null, i];
      }
    }
  }
  return [null, null];
}

// Function to add layers to map
function makeLayers() {

  // Variable for highlighting areas
  let hoveredId = null;

  // Add boundaries tileset
  map.addSource('dots', {
    "type": 'vector',
    "tiles": ['https://cdn.ons.gov.uk/maptiles/administrative/oa/v1/dots/{z}/{x}/{y}.pbf'],
    "promoteId": { "dots": "id" },
    "buffer": 0,
    "maxzoom": 13,
    "minzoom": 8
  });

  map.addSource('bounds', {
    "type": "vector",
    "promoteId": { "OA_bound_ethnicity": "oa11cd" },
    "tiles": ["https://cdn.ons.gov.uk/maptiles/t9/{z}/{x}/{y}.pbf"],
    "minzoom": 11,
    "maxzoom": 14
  });

  // Add layer from the vector tile source with data-driven style
  map.addLayer({
    id: 'dots-join',
    type: 'circle',
    source: 'dots',
    'source-layer': 'dots',
    paint: {
      'circle-color':
        ['case',
          ['!=', ['feature-state', 'color'], null],
          ['feature-state', 'color'],
          'rgba(0, 0, 0, 0)'
        ],
      'circle-radius':
        ['interpolate', ['linear'], ['zoom'], 8, 1, 12, 1.5, 14, 2],
      'circle-opacity': 0.7
    }
  }, 'boundary_country');

  map.addLayer({
    id: 'bounds',
    type: 'fill',
    source: 'bounds',
    'source-layer': 'OA_bound_ethnicity',
    "paint": {
      "fill-outline-color": "#ffffff",
      "fill-color": "#ffffff",
      "fill-opacity": 0
    }
  }, 'boundary_country');

  map.addLayer({
    id: 'boundslines',
    type: 'line',
    source: 'bounds',
    'source-layer': 'OA_bound_ethnicity',
    "paint": {
      "line-opacity": [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        1,
        0
      ],
      "line-color": "rgb(255, 255, 255)",
      "line-width": 1
    }
  }, 'boundary_country');

  // Show data on hover
  map.on('mousemove', 'bounds', function (e) {
    if (e.features.length > 0) {
      if (hoveredId) {
        map.setFeatureState(
          { source: 'bounds', sourceLayer: 'OA_bound_ethnicity', id: hoveredId },
          { hover: false }
        );
      }
      hoveredId = e.features[0].id;
      map.setFeatureState(
        { source: 'bounds', sourceLayer: 'OA_bound_ethnicity', id: hoveredId },
        { hover: true }
      );

      let text = '<strong>Output area ' + hoveredId + '</strong>';
      for (i in data.headers) {
        text += '<br><span class="dot mr-1" style="background-color:' + colors[i] + ';"></span>' + data.headers[i] + ': ' + data.values[hoveredId].counts[i];
      }

      // Populate the popup and set its coordinates
      // based on the feature found.
      popup
        .setLngLat(e.lngLat)
        .setHTML(text)
        .addTo(map);
    }
  });

  // Remove tooltips on mouseleave
  map.on('mouseleave', 'bounds', function () {
    if (hoveredId) {
      map.setFeatureState(
        { source: 'bounds', sourceLayer: 'OA_bound_ethnicity', id: hoveredId },
        { hover: false }
      );
    }
    hoveredId = null;

    popup.remove();
  });

  // Update legend on zoom
  map.on('zoom', function () {
    updateUnits();
  });
}

// Function to set properties of map features
function setProperties(dots) {
  for (dot in dots) {
    let code = dots[dot].substring(0, 9);
    let num = +dots[dot].substring(9, 11);
    let color = getColor(num, data.values[code].breaks);

    map.setFeatureState({
      source: 'dots',
      sourceLayer: 'dots',
      id: dots[dot]
    }, {
      color: color[0],
      group: color[1]
    });
  }
  if (map.isSourceLoaded('centroids')) {
    updateLegend();
  }
}

// Function to check if new dots have been loaded
function updateDots() {
  if (data.totals[0]) {
    let features = map.querySourceFeatures('dots', { 'sourceLayer': 'dots' });
    let newdots = [];
    for (feature in features) {
      let id = features[feature].properties.id;
      let state = map.getFeatureState({
        source: 'dots',
        sourceLayer: 'dots',
        id: id
      });
      if (!state['color']) {
        newdots.push(id);
      }
    }
    setProperties(newdots);
  }
}

// Function to update legend
function updateLegend() {

  // Initialise counts for each group
  let counts = [];
  for (i in data.headers) {
    counts.push(0);
  }

  // Add add group counts for each visible feature
  let features = map.queryRenderedFeatures({ layers: ['centroids'] });
  let ids = [];
  for (feature in features) {
    ids.push(features[feature].id);
  }
  // ids = ids.filter((v, i, a) => a.indexOf(v) === i);
  for (i in ids) {
    let values = data.values[ids[i]].counts;
    for (val in values) {
      counts[val] += values[val];
    }
  }

  // Turn counts into percentages + render to DOM
  let sum = counts.reduce((a, b) => a + b);
  let perc = counts.map((num) => Math.round((num / sum) * 100));
  for (i in perc) {
    document.getElementById('perc' + i).innerHTML = perc[i] + '%';
  }
}

// Function to generate options + set event listener
function genOptions(options) {
  let keys = Object.keys(options);
  let values = Object.values(options);
  let html = ""
  for (i in keys) {
    let selected = i == 0 ? ' selected="selected"' : "";
    let option = '<option value="' + values[i] + '"' + selected + '>' + keys[i] + '</option>';
    html += option;
  }
  selector.innerHTML = html;
  selector.onchange = () => {
    getData(selector.value);
  }
}

// Function to clear map dots styling
function clearDots() {
  map.removeFeatureState({
    source: 'dots',
    sourceLayer: 'dots'
  });
}

// Function to add legend scale
function genLegend(data) {
  let html = '';
  for (i in data.headers) {
    html += '<p class="mb-1"><span class="dot mr-1" style="background-color:' + colors[i] + ';"></span><input type="checkbox" id="legend' + i + '" checked /> <small>' + data.headers[i] + ' <span id="perc' + i + '"></span> <span class="text-secondary">(' + data.perc[i] + '%)</span></small></p>';
  }
  legend.innerHTML = html;
  for (i in data.headers) {
    let element = document.getElementById('legend' + i);
    element.onclick = () => {
      clearDots();
      updateDots();
    };
  }
}

// Function to load OA centroids (for calculating averages in view)
function loadCentroids() {
  fetch(url[0] + 'oalatlng' + url[1])
  .then(response => response.text())
  .then(rawdata => d3.csvParse(rawdata))
  .then(data => json2geo(data))
  .then(geojson => {
    console.log(geojson);
    map.addSource('centroids', {
      "type": "geojson",
      "data": geojson,
      "promoteId": "code"
    });
    map.addLayer({
      id: 'centroids',
      type: 'circle',
      source: 'centroids',
      paint: {
        'circle-opacity': 0,
        'circle-radius': 0
      }
    });
  })
}

// Function to display units based on zoom
function updateUnits() {
  let zoom = map.getZoom();
  let unit = zoom >= 13 ? 10 : zoom >= 12 ? 20 : zoom >= 11 ? 40 : zoom >= 10 ? 80 : zoom >= 9 ? 160 : 320;
  count.innerHTML = unit;
}

// Function to get a postcode lng/lat from COGS
function gotoPostcode(e) {
  let code = postcode.value.replace(new RegExp(' ', 'g'), '').toUpperCase();
  let query = `SELECT ?lat ?lng
  WHERE {
    <http://statistics.data.gov.uk/id/postcode/unit/${code}> <http://www.w3.org/2003/01/geo/wgs84_pos#lat> ?lat ;
    <http://www.w3.org/2003/01/geo/wgs84_pos#long> ?lng .
  }
  LIMIT 1`;
  let url = api + encodeURIComponent(query);

  fetch(url)
    .then(response => response.text())
    .then(rawdata => d3.csvParse(rawdata))
    .then(data => {
      if (data[0]) {
        map.flyTo({
          center: [data[0].lng, data[0].lat],
          zoom: 14
        });
      } else {
        postcode.value = null;
        postcode.placeholder = "Not found. Type a postcode...";
      }
    });
  e.preventDefault();
}

// INITIALISE MAP
mapboxgl.accessToken = 'pk.eyJ1IjoiYXJrYmFyY2xheSIsImEiOiJjamdxeDF3ZXMzN2IyMnFyd3EwdGcwMDVxIn0.P2bkpp8HGNeY3-FOsxXVvA';
var map = new mapboxgl.Map({
  container: 'map',
  style: './data/style-dark.json',
  center: [-1.2471735, 50.8625412],
  zoom: 12,
  maxZoom: 14,
  minZoom: 8
});

// ADD LAYERS + DATA ONCE MAP IS INITIALISED
map.on('load', function () {
  genOptions(options);
  makeLayers();
  updateUnits();
  loadCentroids();
  getData(selector.value);
});

// Set up an event listener on the map.
map.on('sourcedata', function (e) {
  if (map.areTilesLoaded()) {
    updateDots();
  }
});

// Set event listener on postcode search
form.addEventListener('submit', gotoPostcode);