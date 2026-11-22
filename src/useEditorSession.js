import { useRef, useState } from 'react';

// A submitted operation may finish after its editor has been dismissed or replaced.
export function useEditorSession() {
  const [session, setSession] = useState(null);
  const current = useRef(null);
  function open(next) {
    current.current = next;
    setSession(next);
  }
  function close(expected) {
    if (current.current !== expected) return false;
    open(null);
    return true;
  }
  return [session, open, close];
}

// The ref closes the gap before React renders the disabled controls.
export function usePendingSubmission() {
  const active = useRef(false);
  const [pending, setPending] = useState(null);
  const isPending = () => active.current;
  async function run(message, action, onError) {
    if (active.current) return;
    active.current = true;
    setPending(message);
    try {
      await action();
    } catch (error) {
      onError(error);
    } finally {
      active.current = false;
      setPending(null);
    }
  }
  return { pending, isPending, run };
}
