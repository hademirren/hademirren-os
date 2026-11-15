// kept free of three.js so the terminal can list projects without loading the viewers.
// tech is the line under each project window.
export const PROJECTS = [
  {
    id: 'solipsium',
    title: 'solipsium/codemap',
    blurb: 'AI audio repair engine I founded',
    tech: 'Python, PyTorch, FastAPI, Modal, ROCm',
  },
  {
    id: 'rover',
    title: 'rover.urdf',
    blurb: 'ROS2 robot with LiDAR in Gazebo',
    tech: 'ROS2, Gazebo, URDF/xacro, RViz, Python',
  },
  {
    id: 'uav',
    title: 'encounter.py',
    blurb: 'detect-and-avoid sim at Romaeris',
    tech: 'Gazebo, ArduPilot SITL, pymavlink, Python',
  },
  {
    id: 'rasterizer',
    title: 'rasterizer.cpp',
    blurb: '3D renderer in C++, no GPU',
    tech: 'C++',
  },
  {
    id: 'uart',
    title: 'uart.c',
    blurb: 'bare-metal UART driver, Cortex-M',
    tech: 'C, ARM Cortex-M',
  },
]

export const projectById = (id) => PROJECTS.find((p) => p.id === id)
