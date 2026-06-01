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

export const SAMPLE_ROBOTS = [
  {
    id: 'AXM-A3F7B2E1-C9D48502',
    name: 'Sentinel-Alpha',
    type: 'Drone',
    operator: '0x3f4aB2E1...8d2c',
    location: 'Konnex Testnet Zone-1',
    registeredAt: Date.now() - 7 * 86400000,
    status: 'active',
    tasks: 47,
    successRate: 94,
    lastActive: Date.now() - 300000,
    description: 'Long-range surveillance and swarm-coordination drone.',
    memoryCount: 47, // current onchain entries (capped at MEMORY_CAP)
  },
  {
    id: 'AXM-B8C2D3F4-E1A67922',
    name: 'ArmCore-7',
    type: 'Fixed Arm (Roboarm)',
    operator: '0x7b2eA4D9...1f8a',
    location: 'Konnex Testnet Zone-2',
    registeredAt: Date.now() - 14 * 86400000,
    status: 'active',
    tasks: 128,
    successRate: 97,
    lastActive: Date.now() - 120000,
    description: 'Precision manipulation arm with sub-mm accuracy and PoPW reporting.',
    memoryCount: 100, // at cap — oldest pruned automatically
  },
  {
    id: 'AXM-D5E9F1A2-B3C78343',
    name: 'MapBot-Prime',
    type: 'SLAM Navigator',
    operator: '0x2c8fE3B7...5e3b',
    location: 'Konnex Testnet Zone-1',
    registeredAt: Date.now() - 3 * 86400000,
    status: 'active',
    tasks: 23,
    successRate: 91,
    lastActive: Date.now() - 900000,
    description: '3D spatial mapping and localization unit.',
    memoryCount: 23,
  },
  {
    id: 'AXM-F2G6H8A3-C1D59455',
    name: 'SwarmNode-44',
    type: 'Swarm Unit',
    operator: '0x9d4aF1C2...7c1e',
    location: 'Konnex Testnet Zone-3',
    registeredAt: Date.now() - 21 * 86400000,
    status: 'idle',
    tasks: 89,
    successRate: 88,
    lastActive: Date.now() - 7200000,
    description: 'Decentralized swarm coordination node.',
    memoryCount: 89,
  },
  {
    id: 'AXM-H4I7J9B5-D2E6K056',
    name: 'Hum-1 (Atlas-fork)',
    type: 'Humanoid',
    operator: '0x6e2bC8D4...4a9f',
    location: 'Konnex Testnet Zone-2',
    registeredAt: Date.now() - 5 * 86400000,
    status: 'active',
    tasks: 31,
    successRate: 85,
    lastActive: Date.now() - 1800000,
    description: 'Full-body humanoid with VLA/LBM task understanding.',
    memoryCount: 31,
  },
];

export const SAMPLE_MEMORIES = [
  {
    // ── ONCHAIN DIGEST (96 bytes on Konnex) ──
    task_id:        'AXT-M9X4K2-A3F7B2',
    telemetry_hash: '0xa3f7b2e1c9d48502f74a9b1e3c5d8f20a4b6c8e0d2f1a3b5c7e9f0d2a4b6c8',
    popw_score:     88,
    block_number:   1284740,
    // ── OFFCHAIN (IPFS — full telemetry, 0 onchain bytes) ──
    ipfs_cid:       'QmX7vPq2nR8sLmT4kWdBjY1cFpH6eNgUaZ3wVyOi9MsDrK2',
    // ── Index / meta ──
    id:             'MEM-001',
    robotId:        'AXM-A3F7B2E1-C9D48502',
    robotName:      'Sentinel-Alpha',
    taskType:       'Drone Navigation & Swarm Coordination',
    description:    '5-drone formation sweep over 2km grid. Obstacle avoidance active. LiDAR + camera fusion.',
    duration:       '8m 42s',
    timestamp:      Date.now() - 300000,
    outcome:        'SUCCESS',
    commit_phase:   Date.now() - 360000, // when telemetry_hash was committed
    reveal_phase:   Date.now() - 330000, // when validators received telemetry
    score_phase:    Date.now() - 300000, // when PoPW score was finalized
  },
  {
    task_id:        'AXT-N2Y5L3-B8C2D3',
    telemetry_hash: '0xb8c2d3f4e1a67922c58b0d4e6f8a1b3c5d7e9f0b2d4f6a8c0e2d4f6b8a0c2e4',
    popw_score:     95,
    block_number:   1284748,
    ipfs_cid:       'QmR4nKp7sT2mVuW6bXcAyZ8dFqJ1eNhPaL5wBxOj3LtGkY9',
    id:             'MEM-002',
    robotId:        'AXM-B8C2D3F4-E1A67922',
    robotName:      'ArmCore-7',
    taskType:       'Robotic Manipulation (Roboarm)',
    description:    'Pick-and-place: 64 units processed. Gripper calibration verified. Cycle time 22s avg.',
    duration:       '24m 15s',
    timestamp:      Date.now() - 120000,
    outcome:        'SUCCESS',
    commit_phase:   Date.now() - 180000,
    reveal_phase:   Date.now() - 150000,
    score_phase:    Date.now() - 120000,
  },
  {
    task_id:        'AXT-O6Z8M4-D5E9F1',
    telemetry_hash: '0xd5e9f1a2b3c78343a91c2e4f6a8b0d2c4e6f8a0b2d4e6f8a1b3c5d7e9f1a3b5',
    popw_score:     91,
    block_number:   1284720,
    ipfs_cid:       'QmW9mBs3uV7kZpT1cYdAeX4fGqL2hNiPaK6rDsOm8JuHn5',
    id:             'MEM-003',
    robotId:        'AXM-D5E9F1A2-B3C78343',
    robotName:      'MapBot-Prime',
    taskType:       'SLAM / Spatial Perception',
    description:    'Level-3 warehouse SLAM. 1,247 anchor points. Map accuracy 99.2%. Trajectory stored on IPFS.',
    duration:       '45m 08s',
    timestamp:      Date.now() - 900000,
    outcome:        'SUCCESS',
    commit_phase:   Date.now() - 960000,
    reveal_phase:   Date.now() - 930000,
    score_phase:    Date.now() - 900000,
  },
  {
    task_id:        'AXT-P3A9N5-F2G6H8',
    telemetry_hash: '0xf2g6h8a3c1d59455d72e8b0f2d4a6c8e0f2d4a6c8e0a2b4c6d8e0f2a4b6c8d0',
    popw_score:     72,
    block_number:   1284680,
    ipfs_cid:       'QmT6lCr4tS8jYpU2aVbEwZ1eHqK9gMoPbJ7sAnNm4KrFi3',
    id:             'MEM-004',
    robotId:        'AXM-F2G6H8A3-C1D59455',
    robotName:      'SwarmNode-44',
    taskType:       'Robot Fleet Orchestration',
    description:    '12-unit swarm deployment. Node-7 timeout at 8m12s. Partial — 10/12 nodes completed.',
    duration:       '12m 55s',
    timestamp:      Date.now() - 7200000,
    outcome:        'PARTIAL',
    commit_phase:   Date.now() - 7260000,
    reveal_phase:   Date.now() - 7230000,
    score_phase:    Date.now() - 7200000,
  },
  {
    task_id:        'AXT-Q7B1O6-H4I7J9',
    telemetry_hash: '0xa4b6c8d0e2f4a6b8c0d2e4f6a8b0c2d4e6f8a0b2c4d6e8f0a2b4c6d8e0f2a4',
    popw_score:     83,
    block_number:   1284710,
    ipfs_cid:       'QmU8mDs5vW9lAqV3bYeBy Z2fIrL1iPbK7tDpPn5MsGj4',
    id:             'MEM-005',
    robotId:        'AXM-H4I7J9B5-D2E6K056',
    robotName:      'Hum-1 (Atlas-fork)',
    taskType:       'Humanoid Robot Control',
    description:    'Complex assembly. VLA inference 340ms avg. 8/10 subtasks. Motion policy on IPFS.',
    duration:       '18m 32s',
    timestamp:      Date.now() - 1800000,
    outcome:        'SUCCESS',
    commit_phase:   Date.now() - 1860000,
    reveal_phase:   Date.now() - 1830000,
    score_phase:    Date.now() - 1800000,
  },
];

export const NETWORK = {
  totalRobots:    847,
  tasksCompleted: 24891,
  popwVerified:   23104,
  successRate:    92.8,
  activeSubnets:  12,
  blockHeight:    1284750,
  uptime:         99.97,
  knxStaked:      '2.4M',
  totalOnchainKB: Math.round((24891 * 96) / 1024), // ~2.3 MB total onchain
  ipfsPayloads:   24891,
};

export const ACTIVITY_24H = Array.from({ length: 24 }, (_, i) => ({
  hour:     `${String(i).padStart(2, '0')}:00`,
  tasks:    Math.floor(Math.sin(i / 4) * 40 + 80 + Math.random() * 20),
  verified: Math.floor(Math.sin(i / 4) * 35 + 72 + Math.random() * 15),
}));

export const TASKS_BY_CAT = [
  { name: 'SLAM',        count: 4821 },
  { name: 'Manipulation',count: 6234 },
  { name: 'Drone Nav',   count: 5102 },
  { name: 'Fleet Orch',  count: 2890 },
  { name: 'Humanoid',    count: 1847 },
  { name: 'Sensor Fusion',count:3997 },
];

export const ROBOT_DIST = [
  { name: 'Drone',    value: 312 },
  { name: 'Fixed Arm',value: 189 },
  { name: 'SLAM',     value: 142 },
  { name: 'Swarm',    value:  98 },
  { name: 'Humanoid', value:  67 },
  { name: 'Custom',   value:  39 },
];

// ─── Validator Pool ───────────────────────────────────────────────────────────
// Each validator stakes testKNX at registration.
// Wrong scores → stake slash. Honest scores → extra rewards.

export const VALIDATOR_POOL = [
  { id: 'VAL-01', addr: '0x9f3a...2b1c', stake: 12400, reputation: 94, tasksScored: 1847, slashes: 1,  status: 'active',    speciality: 'Drone Navigation' },
  { id: 'VAL-02', addr: '0x4e7b...8d5f', stake:  9800, reputation: 88, tasksScored: 1203, slashes: 2,  status: 'active',    speciality: 'Robotic Manipulation' },
  { id: 'VAL-03', addr: '0x1c2d...6e9a', stake: 15200, reputation: 97, tasksScored: 2341, slashes: 0,  status: 'active',    speciality: 'SLAM / Spatial' },
  { id: 'VAL-04', addr: '0x7f8e...3a2b', stake:  8100, reputation: 79, tasksScored:  892, slashes: 4,  status: 'active',    speciality: 'Sensor Fusion' },
  { id: 'VAL-05', addr: '0x3b4c...9d1e', stake: 11600, reputation: 91, tasksScored: 1654, slashes: 1,  status: 'active',    speciality: 'Fleet Orchestration' },
  { id: 'VAL-06', addr: '0x6a7b...4f2c', stake:  7200, reputation: 65, tasksScored:  441, slashes: 7,  status: 'active',    speciality: 'Humanoid Control' },
  { id: 'VAL-07', addr: '0x2e3f...8c5d', stake: 18900, reputation: 99, tasksScored: 3102, slashes: 0,  status: 'active',    speciality: 'General PoPW' },
  { id: 'VAL-08', addr: '0x5d6e...1b9f', stake:  3000, reputation: 42, tasksScored:  198, slashes: 11, status: 'suspended', speciality: 'General PoPW' },
];

// IPFS payload sections — each validator checks different parts (random sampling)
export const TELEMETRY_SECTIONS = [
  'sensor_header',
  'trajectory_trace',
  'motion_policy_hash',
  'env_map_digest',
  'task_completion_proof',
  'timestamp_chain',
];

// Sample active challenges (24-hour window)
export const SAMPLE_CHALLENGES = [
  {
    id:           'CHG-001',
    memoryId:     'MEM-004',
    taskId:       'AXT-P3A9N5-F2G6H8',
    robotName:    'SwarmNode-44',
    challenger:   '0x7f8e...3a2b',
    challenged:   'VAL-06',
    reason:       'Score 72 outlier — VAL-06 deviated >20pts from consensus',
    status:       'PENDING',
    raisedAt:     Date.now() - 3600000,
    expiresAt:    Date.now() + 82800000,
    consensusScore: 84,
    disputedScore:  62,
  },
];
