/**
 * Provider onboarding — GPU nodes + attestation
 */

import { store, makeId } from './store.js';

const VALID_INTERCONNECTS = ['NVLink', 'InfiniBand', 'PCIe', 'ICI', 'Ethernet', 'none'];
const VALID_ACCELERATORS = ['gpu', 'tpu'];

function normalizeAcceleratorType(body) {
  const raw = String(body.accelerator_type || body.kind || 'gpu').toLowerCase();
  if (!VALID_ACCELERATORS.includes(raw)) {
    throw new Error('accelerator_type must be gpu or tpu');
  }
  return raw;
}

function validateNode(body) {
  const { hostname, region } = body;
  const model = body.accelerator_model || body.gpu_model;
  const count = body.accelerator_count ?? body.gpu_count;
  const memory = body.memory_gb_per_chip ?? body.vram_gb_per_gpu;
  if (!hostname || typeof hostname !== 'string') throw new Error('hostname is required');
  if (!model || typeof model !== 'string') throw new Error('gpu_model or accelerator_model is required');
  if (!Number.isInteger(count) || count < 1) throw new Error('gpu_count / accelerator_count must be integer >= 1');
  if (!Number.isInteger(memory) || memory < 1) throw new Error('vram_gb_per_gpu / memory_gb_per_chip must be integer >= 1');
  if (!region || typeof region !== 'string') throw new Error('region is required');
  const interconnect = body.interconnect || 'none';
  if (!VALID_INTERCONNECTS.includes(interconnect)) throw new Error(`interconnect must be one of ${VALID_INTERCONNECTS.join(', ')}`);
}

export function registerNode(providerId, body) {
  validateNode(body);
  const accelerator_type = normalizeAcceleratorType(body);
  const model = body.accelerator_model || body.gpu_model;
  const count = body.accelerator_count ?? body.gpu_count;
  const memory = body.memory_gb_per_chip ?? body.vram_gb_per_gpu;
  const node = {
    node_id: makeId('node'),
    provider_id: providerId,
    hostname: body.hostname,
    accelerator_type,
    accelerator_model: model,
    gpu_model: model,
    gpu_count: count,
    accelerator_count: count,
    vram_gb_per_gpu: memory,
    memory_gb_per_chip: memory,
    interconnect: body.interconnect || 'none',
    region: body.region,
    attestation_status: 'pending',
    attested_at: null,
    created_at: new Date().toISOString(),
  };
  store.nodes.set(node.node_id, node);
  return node;
}

export function listNodes(providerId) {
  return [...store.nodes.values()].filter(n => n.provider_id === providerId);
}

export function attestNode(providerId, nodeId) {
  const node = store.nodes.get(nodeId);
  if (!node) { const e = new Error('node not found'); e.status = 404; throw e; }
  if (node.provider_id !== providerId) { const e = new Error('forbidden'); e.status = 403; e.code = 'forbidden'; throw e; }
  node.attestation_status = 'attested';
  node.attested_at = new Date().toISOString();
  return node;
}

export function deregisterNode(providerId, nodeId) {
  const node = store.nodes.get(nodeId);
  if (!node) { const e = new Error('node not found'); e.status = 404; throw e; }
  if (node.provider_id !== providerId) { const e = new Error('forbidden'); e.status = 403; e.code = 'forbidden'; throw e; }

  // Check for active reservations on any listing that references this node
  const hasActive = [...store.reservations.values()].some(
    r => r.node_id === nodeId && r.status === 'active'
  );
  if (hasActive) {
    const e = new Error('Cannot deregister node with active reservations');
    e.status = 409;
    throw e;
  }
  store.nodes.delete(nodeId);
  return { deleted: true };
}
