import { useState } from 'react';

export interface ModalStates {
  isModalOpen: boolean;
  isAdminModalOpen: boolean;
  isApprovedModalOpen: boolean;
  isAnalyticsModalOpen: boolean;
  isApplicationTestModalOpen: boolean;
  isSoldItemsModalOpen: boolean;
  isMyPendingItemsModalOpen: boolean;
  isStoreCreditModalOpen: boolean;
  isPOSModalOpen: boolean;
  isRewardsPointsDashboardOpen: boolean;
  isDashboardOpen: boolean;
  isCartModalOpen: boolean;
  isBookmarksModalOpen: boolean;
  isCheckoutOpen: boolean;
  isLoginModalOpen: boolean;
  isItemDetailModalOpen: boolean;
}

export interface ModalActions {
  openModal: (modalName: keyof ModalStates) => void;
  closeModal: (modalName: keyof ModalStates) => void;
  closeAllModals: () => void;
}

export const useModals = (): ModalStates & ModalActions => {
  const [modalStates, setModalStates] = useState<ModalStates>({
    isModalOpen: false,
    isAdminModalOpen: false,
    isApprovedModalOpen: false,
    isAnalyticsModalOpen: false,
    isApplicationTestModalOpen: false,
    isSoldItemsModalOpen: false,
    isMyPendingItemsModalOpen: false,
    isStoreCreditModalOpen: false,
    isPOSModalOpen: false,
    isRewardsPointsDashboardOpen: false,
    isDashboardOpen: false,
    isCartModalOpen: false,
    isBookmarksModalOpen: false,
    isCheckoutOpen: false,
    isLoginModalOpen: false,
    isItemDetailModalOpen: false,
  });

  const openModal = (modalName: keyof ModalStates) => {
    setModalStates(prev => ({
      ...prev,
      [modalName]: true
    }));
  };

  const closeModal = (modalName: keyof ModalStates) => {
    setModalStates(prev => ({
      ...prev,
      [modalName]: false
    }));
  };

  const closeAllModals = () => {
    setModalStates({
      isModalOpen: false,
      isAdminModalOpen: false,
      isApprovedModalOpen: false,
      isAnalyticsModalOpen: false,
      isApplicationTestModalOpen: false,
      isSoldItemsModalOpen: false,
      isMyPendingItemsModalOpen: false,
      isStoreCreditModalOpen: false,
      isPOSModalOpen: false,
      isRewardsPointsDashboardOpen: false,
      isDashboardOpen: false,
      isCartModalOpen: false,
      isBookmarksModalOpen: false,
      isCheckoutOpen: false,
      isLoginModalOpen: false,
      isItemDetailModalOpen: false,
    });
  };

  return {
    ...modalStates,
    openModal,
    closeModal,
    closeAllModals,
  };
}; 