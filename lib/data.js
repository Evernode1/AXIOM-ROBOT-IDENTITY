// ─── Constants ───────────────────────────────────────────────────────────────

export const MEMORY_CAP = 100; // per robot, O(1) onchain storage

export const ROBOT_TYPES = [
  'Drone', 'Mobile Manipulator', 'Fixed Arm (Roboarm)',
  'Humanoid', 'Swarm Unit', 'SLAM Navigator', 'Sensor Fusion Node', 'Custom',
];

export const TASK_CATEGORIES = [
  'Drone Navigation & Swarm Coordination',
  'Robotic Manipulation (Roboarm)',
  'SLAM / Spatial Perception',
  'Sensor Fusion & PoPW Validation',
  'Robot Fleet Orchestration',
  'Robotic General Intelligence VLA/LBM',
  'Humanoid Robot Control',
  'Long Horizon Robotics Task Execution',
  'Robot Identity & Memory',
];

// ─── Memory Entry Schema (Hybrid) ────────────────────────────────────────────
//
//  ONCHAIN (96 bytes per entry, Konnex subnet):
//    task_id         — unique task identifier
//    telemetry_hash  — 32-byte keccak-style hash of full telemetry
//    popw_score      — 0–100 validator consensus score
//    block_number    — Konnex block at commit time
//
//  OFFCHAIN (IPFS — zero onchain cost):
//    ipfs_cid        — CIDv0 of full telemetry payload
//    (sensor streams, trajectory traces, raw execution logs)
//
//  INDEX (server-side, for query/UI only):
//    robotId, robotName, taskType, timestamp, outcome, duration
//
// Memory cap: 100 entries per robot — oldest pruned when exceeded.

// ─── Validator Registration Constants ────────────────────────────────────────

export const VALIDATOR_MIN_STAKE   = 1000;   // tKNX
export const VALIDATOR_REWARD_RATE = 0.005;  // 0.5% of stake per honest task
export const VALIDATOR_SLASH_RATE  = 0.10;   // 10% on deviant score
export const VALIDATOR_SLASH_REPEAT = 0.25;  // 25% on repeat (3+ offences)

export const VALIDATOR_SPECIALITIES = [
  'Drone Navigation & Swarm Coordination',
  'Robotic Manipulation (Roboarm)',
  'SLAM / Spatial Perception',
  'Sensor Fusion & PoPW Validation',
  'Robot Fleet Orchestration',
  'Robotic General Intelligence VLA/LBM',
  'Humanoid Robot Control',
  'Long Horizon Robotics Task Execution',
  'Robot Identity & Memory',
  'General PoPW (All Categories)',
  'Cross-Category Expert',
];

export const VALIDATOR_REGIONS = [
  'Konnex Testnet Zone-1',
  'Konnex Testnet Zone-2',
  'Konnex Testnet Zone-3',
  'Global / No Preference',
];

export const TELEMETRY_SECTIONS = [
  'sensor_header',
  'trajectory_trace',
  'motion_policy_hash',
  'env_map_digest',
  'task_completion_proof',
  'timestamp_chain',
];
