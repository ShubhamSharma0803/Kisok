import React, { useMemo, useState } from 'react';
import { Eye } from 'lucide-react';

const POINTS_PCT = [
  [10, 10], [50, 10], [90, 10],
  [10, 50], [50, 50], [90, 50],
  [10, 90], [50, 90], [90, 90],
];
const CLICKS_PER_POINT = 5;

export default function GazeCalibration({ onComplete, recordCalibrationPoint }) {
  const [pointIndex, setPointIndex] = useState(0);
  const [clicks, setClicks] = useState(0);

  const point = POINTS_PCT[pointIndex];

  const handleClick = () => {
    const x = (point[0] / 100) * window.innerWidth;
    const y = (point[1] / 100) * window.innerHeight;
    recordCalibrationPoint(x, y);

    const nextClicks = clicks + 1;
    if (nextClicks >= CLICKS_PER_POINT) {
      if (pointIndex + 1 >= POINTS_PCT.length) {
        onComplete();
        return;
      }
      setPointIndex((i) => i + 1);
      setClicks(0);
    } else {
      setClicks(nextClicks);
    }
  };

  const progress = useMemo(
    () => Math.round(((pointIndex * CLICKS_PER_POINT + clicks) / (POINTS_PCT.length * CLICKS_PER_POINT)) * 100),
    [pointIndex, clicks]
  );

  return (
    <div className="fixed inset-0 z-[70] premium-shell text-[#211b17]">
      {/* Header info */}
      <div className="absolute top-8 left-1/2 -translate-x-1/2 text-center space-y-3 px-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-[#e7dccd] bg-[#fffaf3] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#a76538] shadow-sm">
          <Eye className="h-3.5 w-3.5" />
          Calibrating
        </div>
        <p className="font-display text-2xl font-semibold text-[#231a15]">Calibrating gaze tracking</p>
        <p className="text-sm font-medium text-[#817166]">
          Look at the dot and tap it {CLICKS_PER_POINT} times. {progress}% done.
        </p>

        {/* Progress bar */}
        <div className="mx-auto w-48 h-2 rounded-full bg-[#e5d9c8] overflow-hidden">
          <div
            className="h-full rounded-full bg-[#1f352d] transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Calibration target dot */}
      <button
        type="button"
        onClick={handleClick}
        aria-label={`Calibration target, ${CLICKS_PER_POINT - clicks} taps remaining`}
        className="absolute w-14 h-14 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#1f352d] border-4 border-[#e9bd67] shadow-[0_0_30px_rgba(31,53,45,0.6),0_0_60px_rgba(233,189,103,0.3)] animate-pulse focus:outline-none focus:ring-4 focus:ring-[#e9bd67]/50"
        style={{ left: `${point[0]}%`, top: `${point[1]}%` }}
      />
    </div>
  );
}