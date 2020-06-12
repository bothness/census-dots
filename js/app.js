// API url
const url = [
  './data/',
  '.tsv'
];

// DOM elements
const spinner = document.getElementById('loader');
const selector = document.getElementById('selector');
const legend = document.getElementById('legend');
const units = document.getElementById('units');
const count = document.getElementById('count');

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
var data = {};
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
  let headers = array[0].split('\t');
  headers.shift();
  json.headers = headers;
  for (i in headers) {
    json.totals.push(0);
  }
  for (var i = 1; i < array.length; i++) {
    let row = array[i].split('\t');
    if (row[1]) {
      let tot = 0;
      let counts = [];
      let breaks = [];
      for (j = 1; j < row.length; j++) {
        let val = parseInt(row[j]);
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
      return colors[i];
    }
  }
  return 'rgba(255, 255, 255, 0)';
}

// Function to add layers to mapp
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
    "minzoom": 0,
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
          'rgba(255, 255, 255, 0)'
        ],
      'circle-radius':
        ['interpolate', ['linear'], ['zoom'], 8, 1, 10, 1, 14, 2]
    }
  }, 'boundary_country');

  map.addLayer({
    id: 'bounds',
    type: 'fill',
    source: 'bounds',
    'source-layer': 'OA_bound_ethnicity',
    "paint": {
      "fill-outline-color": "rgba(250, 250, 250, 0)",
      "fill-color": "rgba(250, 250, 250, 0)"
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
      "line-color": "rgb(0, 0, 0)",
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
    let num = parseInt(dots[dot].substring(9, 11));
    let color = getColor(num, data.values[code].breaks);

    map.setFeatureState({
      source: 'dots',
      sourceLayer: 'dots',
      id: dots[dot]
    }, {
      color: color
    });
  }
}

// Function to check if new dots have been loaded
function updateDots() {
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
    html += '<p class="mb-1"><span class="dot mr-1" style="background-color:' + colors[i] + ';"></span>' + data.headers[i] + ' ' + data.perc[i] + '%</p>';
  }
  legend.innerHTML = html;
}

// Function to display units based on zoom
function updateUnits() {
  let zoom = map.getZoom();
  let unit = zoom >= 13 ? 10 : zoom >= 12 ? 20 : zoom >= 11 ? 40 : zoom >= 10 ? 80 : zoom >= 9 ? 160 : 320;
  count.innerHTML = unit;
}

// Function to set up an event listener on the map.
function watchTiles() {
  map.on('sourcedata', function (e) {
    if (map.areTilesLoaded()) {
      updateDots();
    }
  });
}

// INITIALISE MAP
mapboxgl.accessToken = 'pk.eyJ1IjoiYXJrYmFyY2xheSIsImEiOiJjamdxeDF3ZXMzN2IyMnFyd3EwdGcwMDVxIn0.P2bkpp8HGNeY3-FOsxXVvA';
var map = new mapboxgl.Map({
  container: 'map',
  style: './data/style-omt.json',
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
  getData(selector.value);
  watchTiles();
});