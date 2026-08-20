import React from "react";

const OrderSplashAnimation = ({ onComplete }) => {
  return (
    <div className="order-splash-container">
      <video
        src="/assets/wlcm1.mp4"
        autoPlay
        muted
        playsInline
        className="order-intro-video"
        onEnded={onComplete}
      />
    </div>
  );
};

export default OrderSplashAnimation;