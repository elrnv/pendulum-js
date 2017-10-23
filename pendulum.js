/**
 * pendulum-js JavaScript Pendulum Simulator
 * https://github.com/elrnv/pendulum-js
 *
 * Copyright 2017 Egor Larionov
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *     http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var rc = {
  'init_angle': 45,
  'num_links': 1,
  'length': 1,
  'mass': 1,
  'num_frames': 200
};

var container;
var camera, target_camera;
var scene, renderer;
var width, height;

// Box geometry used to draw the pendulum links
var box_geometry;

// anchor of each pendulum link
var anchors;

var frames_to_render;

var gui_changed = false;
var animation_started = false;

// Main point of entry
var is_chrome = /chrom(e|ium)/.test(navigator.userAgent.toLowerCase());
var is_firefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
if (is_chrome || is_firefox ) {
  $(function() {
    // allocate needed arrays
    container = document.getElementById('webgl-container');

    if (!container) return;

    init();
    init_geometry(0);
    initGUI();

    //render();
  });
}

function guiChanged() {
  gui_changed = true;
}

// initialize gui widget
function initGUI() {
  var gui = new dat.GUI({width: 300});
  gui.close();
  gui.add(rc, 'init_angle',  0, 180).step(1).onChange( guiChanged );
  gui.add(rc, 'num_links', 1, 10).step(1).onChange( guiChanged );
  gui.add(rc, 'length', 0.1, 2).step(0.1).onChange( guiChanged );
  gui.add(rc, 'mass', 0.1, 2).step(0.1).onChange( guiChanged );
  gui.add(rc, 'num_frames', 0, 10000).step(10).onChange( guiChanged );
};

function render() {
  reset();
  reset_geometry();
  reset_image_data();
  if (!animation_started) {
    animation_started = true;
    animate();
  }
}

function reset_resolution() {
  width = container.offsetWidth;
  height = container.offsetHeight;
}

function init() {
  reset_resolution();

  box_geometry = new THREE.BoxGeometry( 1, 1, 1 );
  material = new THREE.MeshBasicMaterial( {color: 0x00FF00 } );
  centroids = new Float32Array(rc.num_links);
  link_mesh = new Array(rc.num_links);

  var near = 0.1, far = 100000;
  //camera = new THREE.OrthographicCamera(
  //    width / -2, width / 2,
  //    height / 2, height / -2,
  //    near, far);
  camera = new THREE.PerspectiveCamera( 75, width/height, near, far );
  camera.position.z = 1000;

  scene = new THREE.Scene();
  renderer = new THREE.WebGLRenderer( { antialias: true } );
  renderer.setClearColor( 0, 0 );
  renderer.setSize(width, height);
}

function reset() {
  while (container.firstChild) { container.removeChild(container.firstChild); }
  frames_to_render = rc.num_frames;

  reset_resolution();

  // if we need more space, allocate more space
  if (link_mesh.length < rc.num_links ) {
    centroids = new Float32Array(rc.num_links);
    link_mesh.length = rc.num_links;
  }

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setSize(width, height);

  container.appendChild(renderer.domElement);
}

function reset_image_data() {
  var canvas = createImageCanvas(target_width, target_height);
  var context = canvas.getContext("2d");
  img_data = context.getImageData(0, 0, target_width, target_height);

  if (rc.weighted) {
    grad_img_data = context.createImageData( img_data ); // create empty img data
    computeGradient( img_data.data, grad_img_data.data, target_width, target_height );
    gaussBlur(grad_img_data.data, grad_img_data.data, target_width, target_height, rc.weight_radius );
    normalize(grad_img_data.data, target_width, target_height);
    context.putImageData( grad_img_data, 0, 0 );
  }
  else {
    grad_img_data = null;
  }
  //container.appendChild(canvas);
}

function reset_centroids() {
  for (var i = 0; i < rc.num_regions; ++i) {
    centroids[2*i] = 0;
    centroids[2*i+1] = 0;
    region_pixels[i] = 0;
    pixel_weight_sums[i] = 0;
  }
}

function reset_geometry() {
  reset_centroids();
  for ( var i = 0; i < rc.num_regions; ++i ) {
    region_mesh[i].position.x = width*(Math.random() - 0.5);
    region_mesh[i].position.y = height*(Math.random() - 0.5);
  }
  reset_region_colors();
}

function reset_scene() {
  scene = new THREE.Scene();
  for ( var i = 0; i < rc.num_regions; ++i ) {
    scene.add(region_mesh[i]);
  }
}

function init_geometry(start) {
  // initialize links
  for ( var i = start; i < rc.num_regions; ++i ) {
    link_mesh[i] = new THREE.Mesh( box_geometry, material );
    link_mesh[i].rotation.x = Math.PI/2;
    scene.add(link_mesh[i]);
  }
}

function animate() {
  if ( gui_changed ) {
    var orig_num_regions = region_mesh.length;
    reset();
    if ( orig_num_regions < rc.num_regions ) init_geometry(orig_num_regions);
    else if ( orig_num_regions > rc.num_regions ) reset_scene();
    reset_geometry();
    reset_image_data();
    gui_changed = false;
  }
  else if ( container.offsetWidth !== width || container.offsetHeight !== height ) {
    reset();
    reset_geometry();
    reset_image_data();
  }
  else
  {
    if (frames_to_render > 0 || frames_to_render === -1) {
      render_to_target();
      paint_regions();
      render();
      reset_region_colors();
      update_positions();
      frames_to_render -= 1;
    }
  }
  requestAnimationFrame(animate);
}

function render_to_target() {
  renderer.render( scene, target_camera, rtt_target, true );

  var gl = renderer.getContext();
  gl.bindFramebuffer(gl.FRAMEBUFFER, rtt_target.__webglFramebuffer);
  gl.readPixels( 0, 0, target_width, target_height, gl.RGBA, gl.UNSIGNED_BYTE, rtt_pixels );

  for ( var y = 0; y < target_height; ++y ) {
    for ( var x = 0; x < target_width; ++x ) {
      var index =     rtt_pixels[2 + 4 * (x + target_width * y)]
              + 256 * rtt_pixels[1 + 4 * (x + target_width * y)]
        + 256 * 256 * rtt_pixels[    4 * (x + target_width * y)] - 1;

      if (index >= 0) region_pixels[index] += 1;
      
      px2idx[x + target_width * y] = index;

      if ( grad_img_data ) {
        // compute pixel weights to bias Lloyd's method
        var weight = 0;
        for ( var k = 0; k < 3; ++k ) {
          weight += grad_img_data.data[k + 4 * (x + target_width * (target_height - y - 1))];
        }
        pixel_weights[x + target_width * y] = weight;
      }
    }
  }

  if ( grad_img_data ) {
    for ( var y = 0; y < target_height; ++y ) {
      for ( var x = 0; x < target_width; ++x ) {
        var index = px2idx[x+target_width*y];
        if ( index >= 0 ) {
          pixel_weight_sums[index] += pixel_weights[x + target_width * y];
        }
      }
    }
  }

  for ( var y = 0; y < target_height; ++y ) {
    for ( var x = 0; x < target_width; ++x ) {
      var index = px2idx[x + target_width * y];
      if (index < 0) continue;
      paint_colors[3*index]     += img_data.data[4 * (x + target_width * (target_height - y - 1))];
      paint_colors[1 + 3*index] += img_data.data[1 + 4 * (x + target_width * (target_height - y - 1))];
      paint_colors[2 + 3*index] += img_data.data[2 + 4 * (x + target_width * (target_height - y - 1))];
      var weight = 1;
      if (grad_img_data) {
        weight = pixel_weights[x + target_width*y];
      }
      centroids[2*index] += x*weight;
      centroids[2*index+1] += y*weight;
    }
  }

  for (var i = 0; i < rc.num_regions; ++i) {
    if ( grad_img_data ) {
      centroids[2*i] /= pixel_weight_sums[i];
      centroids[2*i+1] /= pixel_weight_sums[i];
    }
    else {
      centroids[2*i] /= region_pixels[i];
      centroids[2*i+1] /= region_pixels[i];
    }

    paint_colors[3*i] /= 255*region_pixels[i];
    paint_colors[3*i + 1] /= 255*region_pixels[i];
    paint_colors[3*i + 2] /= 255*region_pixels[i];
  }
}

function paint_regions() {
  for ( var i = 0; i < rc.num_regions; ++i ) {
    materials[i].color.setRGB(paint_colors[3*i],paint_colors[3*i+1],paint_colors[3*i+2]);
  }
}

function reset_region_colors() {
  for ( var i = 0; i < rc.num_regions; ++i ) {
    materials[i].color.setHex(i+1); // ignore the black region
    paint_colors[3*i] = 0;
    paint_colors[3*i + 1] = 0;
    paint_colors[3*i + 2] = 0;
  }
}

function update_positions() {
  for (var i = 0; i < rc.num_regions; ++i) {
    region_mesh[i].position.x = (width/target_width)*(centroids[2*i] - 0.5*target_width + 0.5);
    region_mesh[i].position.y = (height/target_height)*(centroids[2*i+1] - 0.5*target_height + 0.5);
  }

  reset_centroids();
}

function render() {
  renderer.render( scene, camera );
}

function createImageCanvas(w, h) {
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var context = canvas.getContext('2d');

    // draw image in the center
    var hRatio = canvas.width / img.width;
    var vRatio = canvas.height / img.height;
    var ratio  = Math.max( hRatio, vRatio );
    context.drawImage(img,
                    (w - img.width*ratio)/2, (h - img.height*ratio)/2,
                    img.width*ratio, img.height*ratio);
    return canvas;
}

// assuming I is a Uint8ClampedArray of w by h by 4 in size
function computeGradient( I, G, w, h ) {
  var w1 = w+1;
  var h1 = h+1;
  var idx = function(x, y) { return ( x + w * y ) * 4; };
  var gidx = function(x, y) { return ( x + w * y ) * 3; };
  var gidx1 = function(x, y) { return ( x + w1 * y ) * 3; };
  var set_zero = function(A, i) { A[i] = 0; A[i+1] = 0; A[i+2] = 0; };
  var gx = new Uint8ClampedArray( w1*h*3 ); // gradient along horizontal axis
  var gy = new Uint8ClampedArray( w*h1*3 ); // gradient along vertical axis
  // assume zero gradient on the boundaries
  // set boundary to zero
  for ( var y = 0; y < h; ++y ) { set_zero(gx, gidx1(0,y)); }
  for ( var y = 0; y < h; ++y ) { set_zero(gx, gidx1(w,y)); }
  for ( var x = 0; x < w; ++x ) { set_zero(gy, gidx(x,0)); }
  for ( var x = 0; x < w; ++x ) { set_zero(gy, gidx(x,h)); }

  // compute the gradient
  for ( var y = 0; y < h; ++y ) {
    for ( var x = 1; x < w; ++x ) {
      gx[gidx1(x,y)] = Math.abs(I[idx(x-1,y)] - I[idx(x,y)]);
      gx[1+gidx1(x,y)] = Math.abs(I[1+idx(x-1,y)] - I[1+idx(x,y)]);
      gx[2+gidx1(x,y)] = Math.abs(I[2+idx(x-1,y)] - I[2+idx(x,y)]);
    }
  }
  for ( var y = 1; y < h; ++y ) {
    for ( var x = 0; x < w; ++x ) {
      gy[gidx(x,y)] = Math.abs(I[idx(x,y-1)] - I[idx(x,y)]);
      gy[1+gidx(x,y)] = Math.abs(I[1+idx(x,y-1)] - I[1+idx(x,y)]);
      gy[2+gidx(x,y)] = Math.abs(I[2+idx(x,y-1)] - I[2+idx(x,y)]);
    }
  }

  // interpolate gradients
  for ( var y = 0; y < h; ++y ) {
    for ( var x = 0; x < w; ++x ) {
      G[idx(x,y)] = (gx[gidx1(x,y)] + gx[gidx1(x+1,y)] + gy[gidx(x,y)] + gy[gidx(x,y+1)]) / 2;
      G[1+idx(x,y)] = (gx[1+gidx1(x,y)] + gx[1+gidx1(x+1,y)] + gy[1+gidx(x,y)] + gy[1+gidx(x,y+1)]) / 2;
      G[2+idx(x,y)] = (gx[2+gidx1(x,y)] + gx[2+gidx1(x+1,y)] + gy[2+gidx(x,y)] + gy[2+gidx(x,y+1)]) / 2;
      G[3+idx(x,y)] = 255;
    }
  }

}

function normalize(G, w, h) {
  var idx = function(x, y) { return ( x + w * y ) * 4; };
  var max = 0;
  var min = 0;
  for ( var y = 0; y < h; ++y ) {
    for ( var x = 0; x < w; ++x ) {
      var r = G[idx(x,y)];
      var g = G[1+idx(x,y)];
      var b = G[2+idx(x,y)];
      max = Math.max(max, r);
      max = Math.max(max, g);
      max = Math.max(max, b);
      min = Math.min(min, r);
      min = Math.min(min, g);
      min = Math.min(min, b);
    }
  }
  // normalize resulting gradient
  for ( var y = 0; y < h; ++y ) {
    for ( var x = 0; x < w; ++x ) {
      G[idx(x,y)]   -= min;
      G[1+idx(x,y)] -= min;
      G[2+idx(x,y)] -= min;
      G[idx(x,y)]   *= 255/(max-min);
      G[1+idx(x,y)] *= 255/(max-min);
      G[2+idx(x,y)] *= 255/(max-min);
    }
  }
}

// Gaussian blur

function boxesForGauss(sigma, n)  // standard deviation, number of boxes
{
  var wIdeal = Math.sqrt((12*sigma*sigma/n)+1);  // Ideal averaging filter width 
  var wl = Math.floor(wIdeal);  if(wl%2===0) wl--;
  var wu = wl+2;

  var mIdeal = (12*sigma*sigma - n*wl*wl - 4*n*wl - 3*n)/(-4*wl - 4);
  var m = Math.round(mIdeal);
  // var sigmaActual = Math.sqrt( (m*wl*wl + (n-m)*wu*wu - n)/12 );

  var sizes = new Array(n);
  for(var i=0; i<n; i++) {
    sizes[i] = i<m?wl:wu;
  }
  return sizes;
}
function gaussBlur(scl, tcl, w, h, r) {
  var bxs = boxesForGauss(r, 3);
  boxBlur (scl, tcl, w, h, (bxs[0]-1)/2);
  boxBlur (tcl, scl, w, h, (bxs[1]-1)/2);
  boxBlur (scl, tcl, w, h, (bxs[2]-1)/2);
}
function boxBlur(scl, tcl, w, h, r) {
  for(var i=0; i<scl.length; i++) tcl[i] = scl[i];
  boxBlurH(tcl, scl, w, h, r);
  boxBlurT(scl, tcl, w, h, r);
}
function boxBlurH(scl, tcl, w, h, r) {
  var iarr = 1 / (r+r+1);
  for(var i=0; i<h; i++) { // vertical
    for(var k=0; k<3; ++k) {
      var ti = i*w, li = ti, ri = ti+r;
      var fv = scl[k+4*ti], lv = scl[k+4*(ti+w-1)], val = (r+1)*fv;
      for(var j=0; j<r; j++) val += scl[k+4*(ti+j)];
      for(var j=0  ; j<=r ; j++) { val += scl[k+4*(ri++)] - fv       ;   tcl[k+4*(ti++)] = Math.round(val*iarr); }
      for(var j=r+1; j<w-r; j++) { val += scl[k+4*(ri++)] - scl[k+4*(li++)];   tcl[k+4*(ti++)] = Math.round(val*iarr); }
      for(var j=w-r; j<w  ; j++) { val += lv        - scl[k+4*(li++)];   tcl[k+4*(ti++)] = Math.round(val*iarr); }
    }
  }
}
function boxBlurT(scl, tcl, w, h, r) {
  var iarr = 1 / (r+r+1);
  for(var i=0; i<w; i++) { // horizontal
    for(var k=0; k<3; ++k) {
      var ti = i, li = ti, ri = ti+r*w;
      var fv = scl[k+4*ti], lv = scl[k+4*(ti+w*(h-1))], val = (r+1)*fv;
      for(var j=0; j<r; j++) val += scl[k+4*(ti+j*w)];
      for(var j=0  ; j<=r ; j++) { val += scl[k+4*ri] - fv     ;  tcl[k+4*ti] = Math.round(val*iarr);  ri+=w; ti+=w; }
      for(var j=r+1; j<h-r; j++) { val += scl[k+4*ri] - scl[k+4*li];  tcl[k+4*ti] = Math.round(val*iarr);  li+=w; ri+=w; ti+=w; }
      for(var j=h-r; j<h  ; j++) { val += lv      - scl[k+4*li];  tcl[k+4*ti] = Math.round(val*iarr);  li+=w; ti+=w; }
    }
  }
}
