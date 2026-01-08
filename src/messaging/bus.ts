/**
 * Message bus utilities for cross-component communication
 * 
 * Uses BroadcastChannel API + postMessage fallback for iframe communication
 */

export interface BusMessage {
  type: string;
  fromComponent?: string;
  timestamp?: number;
  [key: string]: unknown;
}

/**
 * Create a message bus for a channel
 */
export function createBus(channel: string): {
  send: (message: BusMessage) => void;
  onMessage: (callback: (message: BusMessage) => void) => void;
  destroy: () => void;
} {
  let bc: BroadcastChannel | null = null;
  let messageCallback: ((message: BusMessage) => void) | null = null;
  
  // Try to create BroadcastChannel
  try {
    if ('BroadcastChannel' in window) {
      bc = new BroadcastChannel(channel);
    }
  } catch (e) {
    // BroadcastChannel not available
  }
  
  /**
   * Send a message to all possible targets
   */
  function send(obj: BusMessage): void {
    const s = JSON.stringify(obj);
    
    // BroadcastChannel
    try {
      if (bc) bc.postMessage(obj);
    } catch (e) {}
    
    // Parent frame
    try {
      window.parent.postMessage(s, '*');
    } catch (e) {}
    
    // Top frame (if different from parent)
    try {
      if (window.top && window.top !== window.parent) {
        window.top.postMessage(s, '*');
      }
    } catch (e) {}
    
    // Sibling frames
    try {
      if (window.top?.frames) {
        for (let i = 0; i < window.top.frames.length; i++) {
          const f = window.top.frames[i];
          if (f !== window) {
            try {
              f.postMessage(s, '*');
            } catch (e) {}
          }
        }
      }
    } catch (e) {}
  }
  
  /**
   * Set up message listener
   */
  function onMessage(callback: (message: BusMessage) => void): void {
    messageCallback = callback;
    
    // Listen to BroadcastChannel
    if (bc) {
      bc.onmessage = (e) => {
        if (messageCallback) messageCallback(e.data);
      };
    }
    
    // Listen to postMessage
    window.addEventListener('message', handlePostMessage);
  }
  
  function handlePostMessage(e: MessageEvent): void {
    if (!messageCallback) return;
    
    let data: BusMessage;
    try {
      data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
    } catch {
      return;
    }
    
    messageCallback(data);
  }
  
  /**
   * Clean up
   */
  function destroy(): void {
    if (bc) {
      bc.close();
      bc = null;
    }
    window.removeEventListener('message', handlePostMessage);
    messageCallback = null;
  }
  
  return { send, onMessage, destroy };
}

/**
 * Generate a unique component ID
 */
export function generateComponentId(prefix: string = 'component'): string {
  return `${prefix}-${Math.random().toString(36).substr(2, 9)}`;
}






