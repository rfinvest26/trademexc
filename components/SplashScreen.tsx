import React from 'react';
import { ETORO_LOGO_URL } from '../constants';
import { motion } from 'framer-motion';

const SplashScreen: React.FC = () => {
  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center select-none bg-background"
    >
      <motion.div 
        className="flex flex-col items-center gap-6"
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <div className="flex items-center gap-3">
          <img
            src={ETORO_LOGO_URL}
            alt="MEXC"
            className="w-10 h-10 object-contain"
          />
          <span className="text-[32px] font-black tracking-[-0.02em] text-white">MEXC</span>
        </div>

        <div className="relative w-48 h-1 bg-surfaceElevated rounded-full overflow-hidden mt-4">
          <motion.div
            className="absolute left-0 top-0 h-full bg-accent"
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ duration: 1.5, ease: "easeInOut", repeat: Infinity }}
          />
        </div>
      </motion.div>

      {/* Professional Footer */}
      <div className="absolute bottom-10 flex items-center gap-2 text-[11px] font-medium tracking-widest uppercase text-textMuted/50 select-none pointer-events-none">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <span>Secure Environment</span>
      </div>
    </div>
  );
};

export default SplashScreen;
