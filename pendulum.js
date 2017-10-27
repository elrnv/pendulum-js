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
  'roof_dist': 3.5,
  'mass': 1,
  'gravity': 10,
  'time_step': 0.05,
  'num_frames': 200,
  'stability': 0.01,
  'damping': 0.01,
  'ground_penalty_kp': 20,
  'ground_penalty_kd': 2.5,
  'update_position': false,
  'grid': true,
  'threeD': false,
};

var container;
var controls, camera;
var scene, renderer;
var width, height;
var grid;
var link_mesh;

// Box geometry used to draw the pendulum links
var box_geometry;
var bar_geometry;
var bar_max_height;
var max_height; // max height of the centroid

// initial anchor position of each pendulum link
var anchors;

var frames_to_render;

var gui_changed = false;
var animation_started = false;

var inertia; // inertia tensor (depends on mass and geometry)

// RBD State
var velocity;
var rotation;
var angularvel;

var pendulum_length;
var dx, dy, dz;
var dmass;

var display_mode = true;

// Main point of entry
//var is_chrome = /chrom(e|ium)/.test(navigator.userAgent.toLowerCase());
//var is_firefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
$(function() {
  // allocate needed arrays
  container = document.getElementById('webgl-container');

  if (!container) return;

  init();
  reset_geometry();
  initGUI();

  if (!animation_started) {
    animation_started = true;
    render(); // initial render
    animate();
  }
});


function onDocumentKeyDown(event) {
  var keyCode = event.which;
  if (keyCode == 82) { // r
    console.log("Pressed R");
    reset();
  }
};

function guiChanged() {
  gui_changed = true;
}

// initialize gui widget
function initGUI() {
  var gui = new dat.GUI({width: 300});
  gui.close();
  gui.add(rc, 'init_angle',  0, 180).step(1).onChange( guiChanged );
  gui.add(rc, 'num_links', 1, 10).step(1).onChange( guiChanged );
  gui.add(rc, 'roof_dist', 0.1, 5).step(0.1).onChange( guiChanged );
  gui.add(rc, 'mass', 0.1, 2).step(0.1).onChange( guiChanged );
  gui.add(rc, 'gravity', 0, 100).step(0.5).onChange( guiChanged );
  gui.add(rc, 'time_step', 0.001, 0.3).step(0.001).onChange( guiChanged );
  gui.add(rc, 'num_frames', -1, 10000).step(1).onChange( guiChanged );
  gui.add(rc, 'stability', 0, 10).step(0.01).onChange( guiChanged );
  gui.add(rc, 'damping', 0, 1).step(0.01).onChange( guiChanged );
  gui.add(rc, 'ground_penalty_kp', 0, 100).step(0.01).onChange( guiChanged );
  gui.add(rc, 'ground_penalty_kd', 0, 100).step(0.01).onChange( guiChanged );
  gui.add(rc, 'update_position').onChange( guiChanged );
  gui.add(rc, 'grid').onChange( guiChanged );
  gui.add(rc, 'threeD').onChange( guiChanged );
};

function reset_resolution() {
  width = container.offsetWidth;
  height = container.offsetHeight;
}

function init() {
  pendulum_length = 3;
  dx = 0.2;
  dy = pendulum_length/rc.num_links;
  dz = 0.2;
  dmass = rc.mass/rc.num_links;
  reset_resolution();
  box_geometry = new THREE.BoxGeometry( dx, pendulum_length, dz );
  var inertiax = (dmass/12)*(dz*dz + dy*dy);
  var inertiay = (dmass/12)*(dx*dx + dz*dz);
  var inertiaz = (dmass/12)*(dx*dx + dy*dy);

  inertia = math.matrix([[inertiax, 0, 0], [0, inertiay, 0], [0, 0, inertiaz]]);

  display_mode = !rc.threeD;

  material = new THREE.MeshPhongMaterial( {color: 0x00FF00 } );
  link_mesh = new Array(rc.num_links);
  velocity = new Array(rc.num_links);
  rotation = new Array(rc.num_links);
  angularvel = new Array(rc.num_links);
  anchors = new Array(rc.num_links);

  for ( var i = 0; i < rc.num_links; ++i ) {
    velocity[i] = math.zeros(3);
    rotation[i] = new THREE.Quaternion();
    angularvel[i] = math.zeros(3);
  }

  renderer = new THREE.WebGLRenderer( { antialias: true } );
  renderer.setClearColor( 0, 0 );

  reset_camera();

  document.addEventListener("keydown", onDocumentKeyDown, false);

  grid = new THREE.GridHelper(10,20);
  bar_max_height = 0.4;

  reset_window();
}

function reset_camera() {
  if (display_mode !== rc.threeD) {
    var near = 0.1, far = 1000;
    if (rc.threeD) {
      camera = new THREE.PerspectiveCamera( 50, width/height, near, far );

      controls = new THREE.OrbitControls( camera, renderer.domElement );
      controls.addEventListener( 'change', render );
    }
    else {
      camera = new THREE.OrthographicCamera(
          width / -100, width / 100,
          height/300 + height / 100, height/300 - height / 100,
          near, far);
    }
    camera.position.z = 25;
    display_mode = rc.threeD;
  }
}

function reset_window() {
  while (container.firstChild) { container.removeChild(container.firstChild); }
  frames_to_render = rc.num_frames;

  reset_resolution();

  // if we need more space, allocate more space
  if (link_mesh.length !== rc.num_links ) {
    link_mesh.length = rc.num_links;
    rotation.length = rc.num_links;
    velocity.length = rc.num_links;
    angularvel.length = rc.num_links;
  }

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setSize(width, height);

  container.appendChild(renderer.domElement);
}

function reset_sim() {
  var theta = rc.init_angle*Math.PI/180;
  var prev_p = math.matrix([0,rc.roof_dist,0]);
  for ( var i = 0; i < rc.num_links; ++i ) {
    rotation[i].setFromAxisAngle(new THREE.Vector3(0,0,1), theta);
    if (rc.threeD) {
      var q = new THREE.Quaternion();
      q.setFromAxisAngle(new THREE.Vector3(0,1,0), 45*Math.PI/180);
      rotation[i].multiply(q);
      rotation[i].normalize();
    }
    var r = new THREE.Vector3(0, dy/2, 0);
    r.applyQuaternion(rotation[i]);
    var p = math.subtract(prev_p, math.matrix(r.toArray())).toArray();
    var prev_p = math.subtract(p, math.matrix(r.toArray()));

    link_mesh[i].position.set(p[0], p[1], p[2])
    velocity[i] = math.zeros(3);
    angularvel[i] = math.zeros(3);
    link_mesh[i].setRotationFromQuaternion(rotation[i]);
  }

  max_hieght = rc.roof_dist - dy*0.5*(math.cos(theta));
}

function reset_geometry() {
  scene = new THREE.Scene();
  var light = new THREE.PointLight( 0xFFFFFF, 0.8 );
  light.position.set( 100, 100, 1025 );
  scene.add(light);

  var light = new THREE.PointLight( 0xFFFFFF, 0.3 );
  light.position.set( -1025, -10, 100 );
  scene.add(light);

  var light = new THREE.AmbientLight( 0xFFFF99, 0.2 );
  scene.add(light);

  var kin_material = new THREE.MeshBasicMaterial( {color: 0xFF0000 } );
  var pot_material = new THREE.MeshBasicMaterial( {color: 0x0000FF } );
  bar_geometry = new THREE.BoxGeometry( 0.5, bar_max_height, 0.5 );
  kinetic_energy_bar = new THREE.Mesh( bar_geometry, kin_material );
  potential_energy_bar = new THREE.Mesh( bar_geometry, pot_material );
  set_energy_heights(0,0);
  scene.add(kinetic_energy_bar);
  scene.add(potential_energy_bar);

  // initialize links
  for ( var i = 0; i < rc.num_links; ++i ) {
    link_mesh[i] = new THREE.Mesh( box_geometry, material );
    link_mesh[i].scale.set(1,1.0/rc.num_links,1);
    rotation[i] = new THREE.Quaternion();
    scene.add(link_mesh[i]);
  }
  if (rc.grid) {
    scene.add(grid);
  }
  scene.add(camera);
  reset_sim();
}

function reset() {
  reset_window();
  reset_camera();
  reset_geometry();
  reset_sim();
}

function animate() {
  // update gui if changed
  if ( gui_changed ) {
    // update parameters
    dy = pendulum_length/rc.num_links;
    dmass = rc.mass/rc.num_links;
    var inertiax = (dmass/12)*(dz*dz + dy*dy);
    var inertiay = (dmass/12)*(dx*dx + dz*dz);
    var inertiaz = (dmass/12)*(dx*dx + dy*dy);

    inertia = math.matrix([[inertiax, 0, 0], [0, inertiay, 0], [0, 0, inertiaz]]);
    reset();
    gui_changed = false;
  }
  else
  {
    if (frames_to_render > 0 || frames_to_render < 0) {
      update();
      render();
      frames_to_render -= 1;
    }
  }
  requestAnimationFrame(animate);
}

function render() {
  renderer.render( scene, camera );
}


function skew(vec) {
  return math.matrix([[0, -vec[2], vec[1]], [vec[2], 0, -vec[0]], [-vec[1], vec[0], 0]]);
}

function get_r(i) {
  var rthree = new THREE.Vector3(0, dy/2, 0);
  rthree.applyQuaternion(rotation[i]);
  return math.matrix(rthree.toArray());
}

function update() {
  // preapre system
  var dt = rc.time_step;
  var eye = math.eye(3);
  var neg_eye = math.multiply(math.eye(3), -1);
  var m = dmass;
  var M = math.matrix(math.multiply(m, eye.clone()));

  var I = inertia;

  var sys_size = rc.num_links*9;
  var A = math.zeros(sys_size, sys_size);
  var b = math.zeros(sys_size);
  for (var i = 0; i < rc.num_links; ++i) {

    var r = get_r(i);
    var skewr = skew(r.toArray());

    var off = i*9;
    A.subset(math.index([off+0,off+1,off+2],[off+0,off+1,off+2]), M.toArray());
    A.subset(math.index([off+3,off+4,off+5],[off+3,off+4,off+5]), I.toArray());
    A.subset(math.index([off+6,off+7,off+8],[off+0,off+1,off+2]), neg_eye.toArray());
    A.subset(math.index([off+0,off+1,off+2],[off+6,off+7,off+8]), neg_eye.toArray());
    A.subset(math.index([off+6,off+7,off+8],[off+3,off+4,off+5]), skewr.toArray());
    A.subset(math.index([off+3,off+4,off+5],[off+6,off+7,off+8]), math.multiply(skewr,-1).toArray());

    if (i > 0) { // add nonzero coupling terms to A
      var skewr = skew(get_r(i-1).toArray());
      A.subset(math.index([off+6,off+7,off+8],[off-6,off-5,off-4]), skewr.toArray());
      A.subset(math.index([off-6,off-5,off-4],[off+6,off+7,off+8]), math.multiply(skewr,-1).toArray());
      A.subset(math.index([off+6,off+7,off+8],[off-9,off-8,off-7]), eye.toArray());
      A.subset(math.index([off-9,off-8,off-7],[off+6,off+7,off+8]), eye.toArray());
    }

    var stab_coeff = rc.stability;

    var penalty = [0,0,0];
    var mg = math.multiply(M, math.matrix([0,-rc.gravity,0]));
    if (i === rc.num_links-1) {
      var kp = rc.ground_penalty_kp;
      var kd = rc.ground_penalty_kd;
      var p = math.subtract(math.matrix(link_mesh[i].position.toArray()), r);
      if (p.toArray()[1] < 0) {
        penalty[1] = -kp*p.toArray()[1] - kd*velocity[i].toArray()[1] - mg.toArray()[1];
      }
    }

    b.subset(math.index([off+0,off+1,off+2],0), math.add(mg, math.matrix(penalty)));

    var w = angularvel[i].clone();
    var friction = math.multiply(rc.damping, w)
    b.subset(math.index([off+3,off+4,off+5],0), math.subtract(math.cross(math.multiply(I,w), w), friction));

    var porig_r = math.matrix([0,rc.roof_dist,0]);
    var vorig_r = math.matrix([0,0,0]);
    var rhs_prev = math.matrix([0,0,0]);
    if (i > 0) {
      var r_prev = get_r(i-1);
      porig_r = math.subtract(math.matrix(link_mesh[i-1].position.toArray()), r_prev);
      var w_prev = angularvel[i-1].clone();
      vorig_r = math.cross(r_prev, w_prev);

      rhs_prev = math.cross(w_prev, vorig_r);
    }

    var p_r = math.add(r, math.matrix(link_mesh[i].position.toArray()));
    var stab_p = math.multiply(math.subtract(porig_r, p_r), -stab_coeff);
    var v_r = math.cross(w,r);
    var stab_v = math.multiply(math.subtract(vorig_r, v_r), -0.027*stab_coeff);
    var rhs = math.add(math.subtract(math.cross(w, v_r), rhs_prev), math.add(stab_v,stab_p));

    b.subset(math.index([off+6,off+7,off+8],0), rhs);
  }

  // compute
  var x = math.lusolve(A,b);

  // update
  var Ep = 0;
  var Ek = 0;
  for (var i = 0; i < rc.num_links; ++i) {
    var off = i*9;
    var accel = math.reshape(math.subset(x, math.index([off+0,off+1,off+2], 0)), [3]);
    var ang_accel = math.reshape(math.subset(x, math.index([off+3,off+4,off+5], 0)), [3]);

    // update velocity
    var w = angularvel[i].clone();
    var v = velocity[i].clone();
    var accel_dt = math.multiply(accel, dt);
    velocity[i] = math.add(v, accel_dt);
    var ang_accel_dt = math.multiply(ang_accel, dt);
    angularvel[i] = math.add(w, ang_accel_dt);

    // update rotation
    var axis_temp = math.multiply(angularvel[i], dt);
    var angle = math.norm(axis_temp);
    if (angle > 0) {
      axis_temp = math.divide(axis_temp, angle);
      var axis = new THREE.Vector3();
      axis.fromArray(axis_temp.toArray());
      var dq = new THREE.Quaternion();
      dq.setFromAxisAngle(axis, angle);
      rotation[i].premultiply(dq);
      rotation[i].normalize();
      link_mesh[i].setRotationFromQuaternion(rotation[i]);
    }

    // update position
    var r = get_r(i);
    var p;
    if (!rc.update_position) {
      var porig_r = math.matrix([0,rc.roof_dist,0]);
      if (i > 0) {
        var r_prev = get_r(i-1);
        porig_r = math.subtract(math.matrix(link_mesh[i-1].position.toArray()), r_prev);
      }
      p = math.subtract(porig_r,r).toArray();
    } else {
      var p_prev = math.matrix(link_mesh[i].position.toArray());
      p = math.add(p_prev, math.multiply(velocity[i], dt)).toArray();
    }
    link_mesh[i].position.set(p[0], p[1], p[2]);

    // update energy
    var w_arr = w.toArray();
    var vel2 = math.dot(v, v);
    var Ia = I.toArray();
    Ep += m*rc.gravity*(Math.min(pendulum_length/2 - rc.roof_dist, 0) + p[1]);
    var rotEk = 0.5*(Ia[0][0]*w_arr[0]*w_arr[0] + Ia[1][1]*w_arr[1]*w_arr[1] + Ia[2][2]*w_arr[2]*w_arr[2]);
    Ek += 0.5*m*vel2 + rotEk;
  }
  // update energy bars
  set_energy_heights(Ep, Ek);

}

function set_energy_heights(Ep, Ek) {
    potential_energy_bar.position.set(-4.5, bar_max_height*Ep/2, 0);
    kinetic_energy_bar.position.set(-4.5, bar_max_height*(Ep + Ek/2), 0);
    potential_energy_bar.scale.set(1, Ep, 1);
    kinetic_energy_bar.scale.set(1, Ek, 1);
}
