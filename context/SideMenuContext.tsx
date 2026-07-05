import React, { createContext, useContext, useState } from 'react';

interface SideMenuContextType {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

const SideMenuContext = createContext<SideMenuContextType | undefined>(undefined);

export const SideMenuProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <SideMenuContext.Provider value={{ isOpen, setIsOpen }}>
      {children}
    </SideMenuContext.Provider>
  );
};

export const useSideMenu = () => {
  const ctx = useContext(SideMenuContext);
  if (!ctx) throw new Error('useSideMenu must be used within SideMenuProvider');
  return ctx;
};
