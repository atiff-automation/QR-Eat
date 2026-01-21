'use client';

import React from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ExpenseForm } from './ExpenseForm';

interface ExpenseFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  restaurantId: string;
  expense?: {
    id: string;
    categoryId: string;
    amount: number;
    description: string;
    expenseDate: string;
    vendor: string | null;
    paymentMethod: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'EWALLET';
    invoiceNumber: string | null;
    notes: string | null;
  };
  onSuccess?: () => void;
}

export function ExpenseFormModal({
  isOpen,
  onClose,
  restaurantId,
  expense,
  onSuccess,
}: ExpenseFormModalProps) {
  const handleSuccess = () => {
    onClose();
    onSuccess?.();
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={expense ? 'Edit Expense' : 'Add Expense'}
      noPadding
    >
      <ExpenseForm
        restaurantId={restaurantId}
        expense={expense}
        onSuccess={handleSuccess}
        onCancel={onClose}
      />
    </BottomSheet>
  );
}
