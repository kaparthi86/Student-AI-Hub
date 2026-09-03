/**
 * Optional demo marketplace seed for launch — set SEED_DEMO=1 on the host.
 */

import { registerAccount } from './auth.js';
import { registerNode, attestNode } from './providers.js';
import { createListing } from './listings.js';
import { registerModel } from './inference.js';

let seeded = false;

export function seedDemoMarketplace() {
  if (seeded || process.env.SEED_DEMO !== '1') return null;
  seeded = true;

  const providerA = registerAccount({
    name: 'Atlas GPU Co',
    email: 'demo-provider-a@neoclouds.local',
    role: 'provider',
  });
  const providerB = registerAccount({
    name: 'Pacific Compute',
    email: 'demo-provider-b@neoclouds.local',
    role: 'provider',
  });
  const providerC = registerAccount({
    name: 'Helios TPU',
    email: 'demo-provider-tpu@neoclouds.local',
    role: 'provider',
  });
  registerAccount({
    name: 'Demo Customer',
    email: 'demo-customer@neoclouds.local',
    role: 'customer',
  });

  const nodeA = registerNode(providerA.account_id, {
    hostname: 'gpu-atlas-us-east-1',
    gpu_model: 'H100-SXM5-80GB',
    gpu_count: 8,
    vram_gb_per_gpu: 80,
    interconnect: 'NVLink',
    region: 'us-east-1',
  });
  attestNode(providerA.account_id, nodeA.node_id);

  const nodeB = registerNode(providerA.account_id, {
    hostname: 'gpu-atlas-eu-central-1',
    gpu_model: 'A100-80GB',
    gpu_count: 4,
    vram_gb_per_gpu: 80,
    interconnect: 'InfiniBand',
    region: 'eu-central-1',
  });
  attestNode(providerA.account_id, nodeB.node_id);

  const nodeC = registerNode(providerB.account_id, {
    hostname: 'gpu-pacific-ap-south-1',
    gpu_model: 'L40S-48GB',
    gpu_count: 2,
    vram_gb_per_gpu: 48,
    interconnect: 'PCIe',
    region: 'ap-south-1',
  });
  attestNode(providerB.account_id, nodeC.node_id);

  createListing(providerA.account_id, {
    node_id: nodeA.node_id,
    price_per_hour: '2.85',
    spot: false,
    tags: ['high-memory', 'nvlink'],
    network_bandwidth_gbps: 400,
    storage_gb: 2000,
  });
  createListing(providerA.account_id, {
    node_id: nodeB.node_id,
    price_per_hour: '1.95',
    spot: true,
    tags: ['spot', 'inference'],
    network_bandwidth_gbps: 200,
    storage_gb: 1000,
  });
  createListing(providerB.account_id, {
    node_id: nodeC.node_id,
    price_per_hour: '1.20',
    spot: false,
    tags: ['budget', 'fine-tune'],
    network_bandwidth_gbps: 100,
    storage_gb: 500,
  });

  const nodeTpu = registerNode(providerC.account_id, {
    hostname: 'tpu-helios-us-central1',
    accelerator_type: 'tpu',
    accelerator_model: 'TPU-v5e-8',
    gpu_model: 'TPU-v5e-8',
    gpu_count: 8,
    vram_gb_per_gpu: 16,
    interconnect: 'ICI',
    region: 'us-central1',
  });
  attestNode(providerC.account_id, nodeTpu.node_id);
  createListing(providerC.account_id, {
    node_id: nodeTpu.node_id,
    price_per_hour: '1.60',
    spot: false,
    tags: ['tpu', 'training'],
    network_bandwidth_gbps: 200,
    storage_gb: 1000,
  });

  registerModel(providerA.account_id, {
    node_id: nodeA.node_id,
    model_name: 'meta-llama/Llama-3.1-8B-Instruct',
    model_family: 'llama3',
    context_length: 8192,
    input_price_per_1k_tokens: '0.18',
    output_price_per_1k_tokens: '0.36',
    currency: 'USD',
  });
  registerModel(providerB.account_id, {
    node_id: nodeC.node_id,
    model_name: 'deepseek-ai/DeepSeek-V2-Lite-Chat',
    model_family: 'deepseek',
    context_length: 4096,
    input_price_per_1k_tokens: '0.12',
    output_price_per_1k_tokens: '0.24',
    currency: 'USD',
  });

  return {
    demo_provider_keys_note:
      'Demo provider keys are only returned once at seed time in server logs when SEED_DEMO=1.',
    providers: [providerA.name, providerB.name, providerC.name],
  };
}
