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
 * Regular expression to match Firebase Functions V2 triggers.
 * V2 functions are called directly (e.g., onCall(), onRequest()).
 */
const V2_REGEX = new RegExp(
  '\\b(onCall|onRequest|onSchedule|onTaskDispatched|onMessagePublished|' +
  'onValueWritten|onValueCreated|onValueUpdated|onValueDeleted|' +
  'onObjectFinalized|onObjectArchived|onObjectDeleted|onObjectMetadataUpdated|' +
  'onDocumentWritten|onDocumentCreated|onDocumentUpdated|onDocumentDeleted|' +
  'onUserCreated|onUserDeleted|onBlockingFunction|' +
  'onCustomEventPublished|onLogWritten)' +
  '\\s*\\(',
  'm'
);

/**
 * Regular expression to match Firebase Functions V1 triggers.
 * V1 functions are called via the functions namespace (e.g., functions.https.onCall()).
 */
const V1_REGEX = new RegExp(
  '\\b(functions\\.(https|pubsub|database|firestore|storage|auth|tasks|' +
  'analytics|remoteConfig|testLab|crashlytics|appDistribution|alerts)' +
  '\\.(onCall|onRequest|schedule|ref|instance|document|object|user|taskQueue|' +
  'onUpdate|event|testMatrix|onNewFatalError|onNewNonFatalError|onNewAnr|' +
  'onNewTesterIosDevicePublished|onNewAppFeedbackPublished|onInAppFeedbackPublished|' +
  'onNewEnrollment|onAccept|onAppCrashDetected|onDataWritten))' +
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
  
  const v2Match = data.match(V2_REGEX);
  if (v2Match && v2Match[1]) {
    return {
      isEndpoint: true,
      kind: v2Match[1],
      version: 'v2',
    };
  }

  const v1Match = data.match(V1_REGEX);
  if (v1Match && v1Match[1]) {
    return {
      isEndpoint: true,
      kind: v1Match[1],
      version: 'v1',
    };
  }
  
  return NOT_AN_ENDPOINT;
}