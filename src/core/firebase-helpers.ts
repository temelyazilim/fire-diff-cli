/**
 * Firebase helper functions module.
 * This module provides utility functions for detecting Firebase Cloud Functions
 * triggers and endpoints in code blocks.
 * @module core/firebase-helpers
 */

/**
 * Defines the structured information returned by the endpoint check.
 */
export interface EndpointInfo {
  /** Whether the code block contains a Firebase Functions endpoint trigger. */
  isEndpoint: boolean;
  /** The trigger kind/name (e.g., "onCall", "functions.https.onCall"). */
  kind: string | null;
  /** The Firebase Functions version ('v1' or 'v2'). */
  version: 'v1' | 'v2' | null;
}

/**
 * Default return value when no Firebase Functions endpoint is detected.
 */
const NOT_AN_ENDPOINT: EndpointInfo = {
  isEndpoint: false,
  kind: null,
  version: null,
};

/**
 * Triggers that exist ONLY in V1 (not in V2).
 * These can be identified by their unique names.
 */
const V1_ONLY_TRIGGERS = [
  'schedule', 'ref', 'instance', 'document', 'object', 'user', 'taskQueue',
  'onUpdate', 'event', 'testMatrix', 'onNewFatalError', 'onNewNonFatalError', 'onNewAnr',
  'onNewTesterIosDevicePublished', 'onNewAppFeedbackPublished', 'onInAppFeedbackPublished',
  'onNewEnrollment', 'onAccept', 'onAppCrashDetected', 'onDataWritten'
];

/**
 * Triggers that exist ONLY in V2 (not in V1).
 * These can be identified by their unique names.
 */
const V2_ONLY_TRIGGERS = [
  'onSchedule', 'onTaskDispatched', 'onMessagePublished',
  'onValueWritten', 'onValueCreated', 'onValueUpdated', 'onValueDeleted',
  'onObjectFinalized', 'onObjectArchived', 'onObjectDeleted', 'onObjectMetadataUpdated',
  'onDocumentWritten', 'onDocumentCreated', 'onDocumentUpdated', 'onDocumentDeleted',
  'onUserCreated', 'onUserDeleted', 'onBlockingFunction',
  'onCustomEventPublished', 'onLogWritten'
];

/**
 * Regular expression to match V1-only triggers via functions namespace.
 * Example: functions.database.ref(...), functions.pubsub.schedule(...)
 */
const V1_ONLY_REGEX = new RegExp(
  '\\b(functions\\.(https|pubsub|database|firestore|storage|auth|tasks|' +
  'analytics|remoteConfig|testLab|crashlytics|appDistribution|alerts)' +
  '\\.(' + V1_ONLY_TRIGGERS.join('|') + '))' +
  '\\s*\\(',
  'm'
);

/**
 * Regular expression to match V2-only triggers (called directly).
 * Example: onSchedule(...), onValueWritten(...)
 */
const V2_ONLY_REGEX = new RegExp(
  '\\b(' + V2_ONLY_TRIGGERS.join('|') + ')' +
  '\\s*\\(',
  'm'
);

/**
 * Regular expression to match shared triggers in V1 format.
 * Shared triggers: onCall, onRequest
 * V1 format: functions.https.onCall(...)
 */
const V1_SHARED_REGEX = new RegExp(
  '\\b(functions\\.(https|pubsub|database|firestore|storage|auth|tasks|' +
  'analytics|remoteConfig|testLab|crashlytics|appDistribution|alerts)' +
  '\\.(onCall|onRequest))' +
  '\\s*\\(',
  'm'
);

/**
 * Regular expression to match shared triggers in V2 format.
 * Shared triggers: onCall, onRequest
 * V2 format: onCall(...), onRequest(...)
 */
const V2_SHARED_REGEX = new RegExp(
  '\\b(onCall|onRequest)' +
  '\\s*\\(',
  'm'
);

/**
 * Checks if a given block of code (as a string) contains
 * a known Firebase Functions trigger (V1 or V2) and returns
 * structured information about it.
 *
 * @param data The string content of the function/entity block to check.
 * @returns An 'EndpointInfo' object with 'isEndpoint', 'kind', and 'version'.
 */
export function getEndpointInfo(data: string): EndpointInfo {
  
  // Step 1: Check for V1-only triggers (most specific, check first)
  // Example: functions.database.ref(...), functions.pubsub.schedule(...)
  const v1OnlyMatch = data.match(V1_ONLY_REGEX);
  if (v1OnlyMatch && v1OnlyMatch[1]) {
    return {
      isEndpoint: true,
      kind: v1OnlyMatch[1],
      version: 'v1',
    };
  }

  // Step 2: Check for V2-only triggers (most specific, check second)
  // Example: onSchedule(...), onValueWritten(...)
  const v2OnlyMatch = data.match(V2_ONLY_REGEX);
  if (v2OnlyMatch && v2OnlyMatch[1]) {
    return {
      isEndpoint: true,
      kind: v2OnlyMatch[1],
      version: 'v2',
    };
  }

  // Step 3: Check for shared triggers in V1 format (functions.https.onCall)
  // Check V1 first to avoid false matches with V2
  const v1SharedMatch = data.match(V1_SHARED_REGEX);
  if (v1SharedMatch && v1SharedMatch[1]) {
    return {
      isEndpoint: true,
      kind: v1SharedMatch[1],
      version: 'v1',
    };
  }

  // Step 4: Check for shared triggers in V2 format (onCall, onRequest)
  const v2SharedMatch = data.match(V2_SHARED_REGEX);
  if (v2SharedMatch && v2SharedMatch[1]) {
    return {
      isEndpoint: true,
      kind: v2SharedMatch[1],
      version: 'v2',
    };
  }
  
  return NOT_AN_ENDPOINT;
}