# A simple pendulum simulation

A simple multi-link pendulum simulator.  [Demo](https:/elrnv.github.io/pendulum-js)

A green pendulum affected by gravity and constraint forces, swings back and
forth. A stacked bar graph on the left indicates the total amount of kinetic
energy (in red) and potential energy (in blue) of the pendulum.

## Optional Controls:

The simulation has a number of options:

- `init_angle`: The angle that the pendulum makes with the vertical at the start of the simulation.
- `num_links`: Number of connected links making up the pendulum.
- `roof_dist`: The height at which the pendulum is attached to the "ceiling".
- `mass`: The total mass of the pendulum. Each link has mass `mass/num_links`.
- `gravity`: The gravitational acceleration constant.
- `time_step`: The time step of the simulation.
- `num_frames`: The number of frames to render before stopping the simulation. If set to `-1`, the simulation will never stop.
- `stability`: Stabilization coefficient for Baumgarte stabilization.
- `damping`: Frictional damping coefficient.
- `ground_penalty_kp`: Spring coefficient for the penalty force applied to the last link by the ground plane.
- `ground_penalty_kd`: Damping coefficient for the penalty force applied to the last link by the ground plane.
- `update_position`: When checked, the simulation updates the position of the center of mass of each link using forward explicit Euler integration. When unchecked, the center of mass position is determined from the rotation, which is updated using explicit Euler integration.
- `grid`: Display the grid indicating where the ground plane lies.
- `threeD`: Enable 3D view. The same simulation runs, but the view changes to 3D and the pendulum is rotated to demonstrate full 3D motion.

You may also press the "r" key to reset the simulation.
