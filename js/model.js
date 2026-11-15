// Seed configuration, schema constants and factories. Pure module (no DOM) so it is testable in Node.

export const SCHEMA_VERSION = 1;

export const CATEGORY_IDS = ['technical', 'projects', 'health', 'personal', 'life'];

export const DEFAULT_WEIGHTS = { technical: 30, projects: 15, health: 30, personal: 15, life: 10 };

export const WHY_LOW_CHIPS = [
  { id: 'tired', label: 'Tired' },
  { id: 'busy', label: 'Busy at work' },
  { id: 'unwell', label: 'Unwell' },
  { id: 'travel', label: 'Travel' },
  { id: 'motivation', label: 'Low motivation' },
  { id: 'other', label: 'Other' },
];

const a = (one, three, five) => ({ 1: one, 3: three, 5: five });

export function seedConfig(now = new Date().toISOString()) {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: now,
    weights: { ...DEFAULT_WEIGHTS },
    settings: { reminderTime: '21:30', weekStartsOn: 0 },
    categories: [
      { id: 'technical', name: 'Technical', emoji: '🧠', order: 0 },
      { id: 'projects', name: 'Projects', emoji: '🚀', order: 1 },
      { id: 'health', name: 'Health', emoji: '🌿', order: 2 },
      { id: 'personal', name: 'Personal skills', emoji: '🗣️', order: 3 },
      { id: 'life', name: 'Life', emoji: '☀️', order: 4 },
    ],
    items: [
      // Technical (learning: effort 0–5 + milestone ticks + optional minutes)
      { id: 'system-design', name: 'System design', category: 'technical', type: 'learning', order: 0,
        anchors: a('Skimmed something, no real focus', 'Studied one concept properly', 'Deep session + drew/explained a full design') },
      { id: 'dsa', name: 'Data structures & algorithms', category: 'technical', type: 'learning', order: 1,
        anchors: a('Read about a topic only', 'Solved 1–2 problems', 'Solved 3+ problems incl. a hard one') },
      { id: 'ai-models', name: 'AI model creation', category: 'technical', type: 'learning', order: 2,
        anchors: a('Read/watched passively', 'Ran or modified a training notebook', 'Trained/evaluated a model end to end') },
      { id: 'ai-infra', name: 'AI infra building', category: 'technical', type: 'learning', order: 3,
        anchors: a('Read docs only', 'Set up / configured one component', 'Deployed or load-tested a working stack') },
      { id: 'industrial-automation', name: 'Industrial automation (actuators, motors)', category: 'technical', type: 'learning', order: 4,
        anchors: a('Read theory only', 'Simulated or wired a small circuit', 'Built/tested a working motor or actuator setup') },
      { id: 'rag', name: 'RAG pipelines & variants', category: 'technical', type: 'learning', order: 5,
        anchors: a('Read an article', 'Implemented one technique', 'Built + evaluated a working pipeline') },
      // Projects
      { id: 'xyz-project', name: 'XYZ project', category: 'projects', type: 'learning', order: 0,
        anchors: a('Thought about it only', 'Moved one task forward', 'Shipped a meaningful piece / unblocked a milestone') },
      // Health
      { id: 'steps', name: 'Steps & distance', category: 'health', type: 'metric', order: 0,
        fields: [
          { key: 'steps', label: 'Steps', unit: 'steps', goal: 10000, min: 0, max: 100000, step: 100, autofill: 'steps', primary: true },
          { key: 'km', label: 'Distance', unit: 'km', min: 0, max: 100, step: 0.1, autofill: 'km' },
        ],
        anchors: a('Mostly sitting', 'Around half the step goal', 'Step goal reached or beaten') },
      { id: 'jogging', name: 'Jogging', category: 'health', type: 'score+minutes', order: 1,
        fields: [{ key: 'km', label: 'Jog distance', unit: 'km', min: 0, max: 60, step: 0.1 }],
        anchors: a('Short easy jog', 'Steady jog, planned distance', 'Strong run, pushed pace or distance') },
      { id: 'strength', name: 'Strength training', category: 'health', type: 'score+minutes', order: 2,
        anchors: a('A few bodyweight sets', 'Full planned session', 'Full session with progressive overload') },
      { id: 'yoga', name: 'Yoga', category: 'health', type: 'score+minutes', order: 3,
        anchors: a('A few stretches', '20–30 min practice', 'Full mindful practice, felt great') },
      { id: 'meditation', name: 'Meditation', category: 'health', type: 'score+minutes', order: 4,
        anchors: a('A few mindful breaths', '10 min focused sit', '20+ min, calm and present') },
      { id: 'sleep', name: 'Sleep', category: 'health', type: 'metric', hasScore: true, order: 5,
        fields: [{ key: 'hours', label: 'Hours', unit: 'h', goal: 8, min: 0, max: 16, step: 0.1, autofill: 'sleep', primary: true }],
        anchors: a('Restless, woke tired', 'Okay sleep', 'Deep sleep, woke refreshed') },
      { id: 'energy', name: 'Energy', category: 'health', type: 'score', order: 6,
        anchors: a('Drained most of the day', 'Steady, normal energy', 'Energetic and sharp all day') },
      { id: 'hrv', name: 'HRV', category: 'health', type: 'metric', excludeFromScore: true, order: 7,
        fields: [{ key: 'hrv', label: 'HRV', unit: 'ms', min: 0, max: 300, step: 1, autofill: 'hrv', primary: true }],
        anchors: a('—', '—', '—') },
      // Personal skills
      { id: 'communication', name: 'Communication', category: 'personal', type: 'score', order: 0,
        anchors: a('No deliberate practice', 'Spoke up clearly in one meeting', 'Led a presentation or actively sought feedback') },
      { id: 'leadership', name: 'Leadership', category: 'personal', type: 'score', order: 1,
        anchors: a('No leadership moment', 'Guided or unblocked someone', 'Owned a decision, mentored, or rallied a team') },
      // Life
      { id: 'family', name: 'Family time', category: 'life', type: 'score', order: 0,
        anchors: a('Barely any time together', 'Some present, phone-free time', 'Quality, fully present time') },
      { id: 'laughter', name: 'Laughter', category: 'life', type: 'score', order: 1,
        anchors: a('Hardly smiled', 'A few good laughs', 'Laughed a lot, light-hearted day') },
      { id: 'deep-work', name: 'Deep-work focus', category: 'life', type: 'score', order: 2,
        anchors: a('Scattered, constant switching', '1 solid focus block', '2+ deep, distraction-free blocks') },
    ],
  };
}

const ms = (titles) => titles.map((title, i) => ({ id: `m${i + 1}`, title, done: false, doneDate: null }));

export function seedMilestones(now = new Date().toISOString()) {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: now,
    lists: {
      'system-design': ms(['Scalability basics (vertical vs horizontal)', 'Load balancing', 'Caching strategies', 'Databases: SQL vs NoSQL, indexing', 'Sharding & replication', 'Consistency, CAP & PACELC', 'Message queues & event streaming', 'Rate limiting & API gateway', 'Design a URL shortener', 'Design a chat system', 'Design a news feed', 'Design an AI inference platform']),
      dsa: ms(['Arrays & strings', 'Hashing', 'Two pointers & sliding window', 'Stacks & queues', 'Linked lists', 'Binary search', 'Trees & BST', 'Heaps / priority queues', 'Graphs: BFS & DFS', 'Shortest paths & topological sort', 'Dynamic programming I', 'Dynamic programming II', 'Tries & union-find', '100 problems solved']),
      'ai-models': ms(['ML fundamentals refresh', 'PyTorch basics', 'Train a small neural net from scratch', 'Transformers & attention internals', 'Fine-tune a small LLM (LoRA/QLoRA)', 'Evaluation & benchmarks', 'Quantization & distillation', 'Ship a custom model end to end']),
      'ai-infra': ms(['GPU & CUDA basics', 'Containers & Kubernetes for ML', 'Model serving (vLLM / Triton)', 'Vector databases at scale', 'Observability for LLM apps', 'Cost & latency optimization', 'CI/CD for ML (MLOps)', 'Deploy a production inference stack']),
      'industrial-automation': ms(['Electrical basics & sensors', 'DC, stepper & servo motors', 'Motor drivers & PWM', 'Actuators: linear, pneumatic, solenoid', 'PLC basics & ladder logic', 'Microcontrollers (Arduino / ESP32)', 'Industrial protocols (Modbus / OPC UA)', 'Control loops (PID)', 'Build a working motor-control prototype']),
      rag: ms(['Basic RAG pipeline', 'Chunking strategies', 'Embeddings & vector stores', 'Hybrid search (BM25 + vector)', 'Reranking', 'Query rewriting & multi-query', 'GraphRAG', 'Agentic RAG', 'Evaluation (RAGAS-style)', 'Production RAG project']),
      'xyz-project': ms(['Problem validated', 'Architecture designed', 'MVP built', 'Testing done', 'Deployed to production', 'First real users', 'Feedback improvements', 'Stable release']),
    },
  };
}

export function seedTargets(now = new Date().toISOString()) {
  return { schemaVersion: SCHEMA_VERSION, updatedAt: now, targets: [] };
}

export function emptyYear(year) {
  return { schemaVersion: SCHEMA_VERSION, year, days: {} };
}

let counter = 0;
export function uid(prefix = 'id') {
  counter = (counter + 1) % 1e6;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
