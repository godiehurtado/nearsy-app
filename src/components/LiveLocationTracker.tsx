// src/components/LiveLocationTracker.tsx
import { firebaseAuth } from '../config/firebaseConfig';
import { useLiveLocation } from '../hooks/useLiveLocation';

export default function LiveLocationTracker() {
  const uid = firebaseAuth.currentUser?.uid ?? null;
  useLiveLocation({
    enabled: true,
    uid,
    distanceInterval: 15, // ≥ 15m de movimiento
    timeIntervalMs: 60_000, // no más de 1 reporte por minuto
  });
  return null; // no renderiza UI
}
