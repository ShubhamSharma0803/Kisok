import React, { useEffect } from "react";

const OrderSplashAnimation = ({ onComplete }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete?.();
    }, 5000);

    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="order-splash-container">
      <video
        src="/assets/intro.mp4"
        autoPlay
        muted
        playsInline
        className="order-intro-video"
      />
    </div>
  );
};

export default OrderSplashAnimation;