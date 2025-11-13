/**
 * Firebase helper functions module.
 * 
 * This module provides utility functions for detecting Firebase Cloud Functions
 * triggers and endpoints in code blocks.
 * 
 * @module core/firebase-helpers
 */

/**
 * Checks if a given block of code (as a string) contains
 * a known Firebase Functions trigger (V1 or V2).
 *
 * This uses a Regex to check for patterns like 'onCall(', 'onRequest(',
 * 'functions.https.onCall(', 'functions.database.ref(', etc.
 *
 * @param data The string content of the function/entity block to check.
 * @returns True if a Firebase endpoint trigger is detected, otherwise false.
 */
export function isFirebaseEndPoint(data: string): boolean {
  
  // This Regex checks for V1 and V2 trigger patterns.
  // It looks for the function name followed by optional whitespace and an opening parenthesis '('.
  // \b ensures we match whole words (e.g., 'onCall' not 'myOnCall').
  const firebaseTriggerRegex = new RegExp(
    // V2 Triggers (e.g., onCall, onRequest, onValueWritten, etc.)
    '\\b(onCall|onRequest|onSchedule|onTaskDispatched|onMessagePublished|' +
    'onValueWritten|onValueCreated|onValueUpdated|onValueDeleted|' +
    'onObjectFinalized|onObjectArchived|onObjectDeleted|onObjectMetadataUpdated|' +
    'onDocumentWritten|onDocumentCreated|onDocumentUpdated|onDocumentDeleted|' +
    'onUserCreated|onUserDeleted|onBlockingFunction|onCustomEventPublished)' +
    
    // Optional whitespace and parenthesis
    '\\s*\\(' +
    
    '|' + // OR
    
    // --- GÜNCELLENMİŞ V1 KURALI ---
    // V1 Triggers (now includes '.instance(')
    '\\b(functions\\.(https|pubsub|database|firestore|storage|auth|tasks)\\.' +
    // '.ref(' OR '.instance(' OR '.document(' etc.
    '(onCall|onRequest|schedule|ref|instance|document|object|user|taskQueue))' +
    // --- GÜNCELLEME BİTTİ ---
    
    // Optional whitespace and parenthesis
    '\\s*\\(',
    
    'm' 
  );

  return firebaseTriggerRegex.test(data);
}