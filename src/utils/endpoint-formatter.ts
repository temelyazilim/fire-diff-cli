/**
 * Endpoint formatter utilities module.
 * 
 * This module provides utilities for formatting and grouping endpoint data
 * for JSON output.
 * 
 * @module utils/endpoint-formatter
 */

import { EndpointListResult } from '../core/types';

/**
 * Groups endpoints by file path and version (v1/v2).
 * Removes redundant 'path' and 'version' fields from endpoint objects
 * since they are already represented in the hierarchical structure.
 * 
 * @param endpoints Array of endpoint results to group.
 * @returns A nested object structure: { [filePath]: { v1: [...], v2: [...] } }
 *          where each endpoint object contains only: name, deployname, kind
 */
export function groupEndpointsByPathAndVersion(
  endpoints: EndpointListResult[]
): Record<string, Partial<{ v1: Array<{ name: string; deployname: string; kind: string | null }>; v2: Array<{ name: string; deployname: string; kind: string | null }> }>> {
  const grouped: Record<string, { v1: Array<{ name: string; deployname: string; kind: string | null }>; v2: Array<{ name: string; deployname: string; kind: string | null }> }> = {};

  for (const endpoint of endpoints) {
    let pathGroup = grouped[endpoint.path];
    if (!pathGroup) {
      pathGroup = {
        v1: [],
        v2: []
      };
      grouped[endpoint.path] = pathGroup;
    }

    // Extract only name, deployname, and kind (path and version are in hierarchy)
    const endpointData = {
      name: endpoint.name,
      deployname: endpoint.deployname,
      kind: endpoint.kind
    };

    if (endpoint.version === 'v1') {
      pathGroup.v1.push(endpointData);
    } else if (endpoint.version === 'v2') {
      pathGroup.v2.push(endpointData);
    }
  }

  // Remove empty version arrays from the result
  const result: Record<string, Partial<{ v1: Array<{ name: string; deployname: string; kind: string | null }>; v2: Array<{ name: string; deployname: string; kind: string | null }> }>> = {};
  
  for (const [path, versions] of Object.entries(grouped)) {
    const cleanedVersions: Partial<{ v1: Array<{ name: string; deployname: string; kind: string | null }>; v2: Array<{ name: string; deployname: string; kind: string | null }> }> = {};
    
    if (versions.v1.length > 0) {
      cleanedVersions.v1 = versions.v1;
    }
    if (versions.v2.length > 0) {
      cleanedVersions.v2 = versions.v2;
    }
    
    result[path] = cleanedVersions;
  }

  return result;
}

