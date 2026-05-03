import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api, storage, COLORS, Doctor } from '../../src/lib/api';

interface Earnings {
  visits_completed: number;
  total_earned: number;
  net_earned: number;
  available: number;
  withdrawn: number;
  pending_withdrawal: number;
  this_week_visits: number;
  this_week_earnings: number;
}

interface Withdrawal {
  id: string;
  amount: number;
  method: string;
  status: string;
  requested_at: string;
}

export default function EarningsScreen() {
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const u = await storage.getUser();
    if (!u) return;
    const all = await api.listDoctors();
    const me =
      all.find((d) => d.name.toLowerCase() === u.name.toLowerCase()) || all[0];
    setDoctor(me);
    if (me) {
      const [e, w] = await Promise.all([
        api.getEarnings(me.id),
        api.listWithdrawals(me.id),
      ]);
      setEarnings(e);
      setWithdrawals(w);
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const showAlert = (msg: string) => {
    if (Platform.OS === 'web') {
      window.alert(msg);
    } else {
      Alert.alert('NURTIX', msg);
    }
  };

  const submitWithdraw = async () => {
    if (!doctor || !earnings) return;
    const n = parseInt(amount, 10);
    if (!n || n <= 0) {
      showAlert('Enter a valid amount.');
      return;
    }
    if (n > earnings.available) {
      showAlert(`Max available: ₹${earnings.available}`);
      return;
    }
    setSubmitting(true);
    try {
      const r = await api.requestWithdrawal(doctor.id, n);
      if (r?.id) {
        setModalOpen(false);
        setAmount('');
        await load();
        showAlert('Withdrawal requested. It will be processed within 2 business days.');
      } else {
        showAlert(r?.detail || 'Withdrawal failed.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !doctor || !earnings) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={{ paddingTop: 8, paddingBottom: 12 }}>
          <Text style={styles.label}>YOUR WALLET</Text>
          <Text style={styles.title}>Earnings</Text>
        </View>

        <View style={styles.balanceCard} testID="available-balance-card">
          <Text style={styles.availLabel}>AVAILABLE BALANCE</Text>
          <Text style={styles.availAmount}>₹{earnings.available.toLocaleString()}</Text>
          <Text style={styles.availSub}>
            After 15% platform fee · Min withdrawal ₹500
          </Text>
          <TouchableOpacity
            testID="withdraw-button"
            style={[styles.withdrawBtn, earnings.available < 500 && { opacity: 0.4 }]}
            disabled={earnings.available < 500}
            onPress={() => setModalOpen(true)}
          >
            <Ionicons name="cash-outline" size={18} color={COLORS.primary} />
            <Text style={styles.withdrawText}>Withdraw to bank</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>₹{earnings.this_week_earnings}</Text>
            <Text style={styles.statLabel}>THIS WEEK</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{earnings.visits_completed}</Text>
            <Text style={styles.statLabel}>VISITS DONE</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>₹{earnings.withdrawn}</Text>
            <Text style={styles.statLabel}>WITHDRAWN</Text>
          </View>
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.row}>
            <Text style={styles.sumKey}>Gross earned</Text>
            <Text style={styles.sumVal}>₹{earnings.total_earned.toLocaleString()}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.sumKey}>Platform fee (15%)</Text>
            <Text style={[styles.sumVal, { color: COLORS.error }]}>
              −₹{(earnings.total_earned - earnings.net_earned).toLocaleString()}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.sumKey}>Net earned</Text>
            <Text style={[styles.sumVal, { fontWeight: '800' }]}>
              ₹{earnings.net_earned.toLocaleString()}
            </Text>
          </View>
          {earnings.pending_withdrawal > 0 && (
            <>
              <View style={styles.divider} />
              <View style={styles.row}>
                <Text style={styles.sumKey}>Pending withdrawal</Text>
                <Text style={[styles.sumVal, { color: COLORS.warning }]}>
                  ₹{earnings.pending_withdrawal.toLocaleString()}
                </Text>
              </View>
            </>
          )}
        </View>

        <View style={{ marginTop: 24 }}>
          <Text style={styles.sectionTitle}>Withdrawal history</Text>
          {withdrawals.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="receipt-outline" size={32} color={COLORS.textDisabled} />
              <Text style={styles.emptyText}>No withdrawals yet</Text>
            </View>
          ) : (
            withdrawals.map((w) => (
              <View key={w.id} style={styles.wdCard} testID={`withdrawal-${w.id}`}>
                <View
                  style={[
                    styles.wdIcon,
                    {
                      backgroundColor:
                        w.status === 'completed' ? '#DFF3EA' : '#FFF4D9',
                    },
                  ]}
                >
                  <Ionicons
                    name={w.status === 'completed' ? 'checkmark-circle' : 'time'}
                    size={18}
                    color={w.status === 'completed' ? COLORS.success : COLORS.warning}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.wdAmount}>₹{w.amount.toLocaleString()}</Text>
                  <Text style={styles.wdSub}>
                    {w.method.replace('_', ' ')} ·{' '}
                    {new Date(w.requested_at).toLocaleDateString()}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.wdStatus,
                    {
                      color: w.status === 'completed' ? COLORS.success : COLORS.warning,
                    },
                  ]}
                >
                  {w.status.toUpperCase()}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <Modal
        visible={modalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Withdraw funds</Text>
            <Text style={styles.modalSub}>
              Available: ₹{earnings.available.toLocaleString()}
            </Text>
            <TextInput
              testID="withdraw-amount-input"
              value={amount}
              onChangeText={(t) => setAmount(t.replace(/[^0-9]/g, ''))}
              placeholder="Enter amount in ₹"
              placeholderTextColor={COLORS.textDisabled}
              keyboardType="number-pad"
              style={styles.modalInput}
            />
            <View style={styles.quickRow}>
              {[500, 1000, 2000, earnings.available].filter(Boolean).map((v, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => setAmount(String(v))}
                  style={styles.quickChip}
                >
                  <Text style={styles.quickChipText}>₹{v}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                onPress={() => setModalOpen(false)}
                style={[styles.modalBtn, styles.modalCancel]}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="confirm-withdraw"
                disabled={submitting}
                onPress={submitWithdraw}
                style={[styles.modalBtn, styles.modalConfirm, submitting && { opacity: 0.6 }]}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.modalConfirmText}>Confirm</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingHorizontal: 20 },
  label: { fontSize: 10, letterSpacing: 3, color: COLORS.textSecondary },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.textPrimary },
  balanceCard: {
    backgroundColor: COLORS.primary,
    borderRadius: 28,
    padding: 22,
  },
  availLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 10, letterSpacing: 2 },
  availAmount: { color: '#FFF', fontSize: 40, fontWeight: '800', marginTop: 4, letterSpacing: -1 },
  availSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 4 },
  withdrawBtn: {
    backgroundColor: '#FFF',
    borderRadius: 999,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 18,
  },
  withdrawText: { color: COLORS.primary, fontWeight: '700', fontSize: 15 },
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  stat: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.surface,
  },
  statValue: { fontSize: 18, fontWeight: '800', color: COLORS.textPrimary },
  statLabel: { fontSize: 10, letterSpacing: 1.5, color: COLORS.textSecondary, marginTop: 4 },
  summaryCard: {
    backgroundColor: '#FFF',
    borderRadius: 22,
    padding: 18,
    marginTop: 14,
    borderWidth: 1,
    borderColor: COLORS.surface,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sumKey: { color: COLORS.textSecondary, fontSize: 14 },
  sumVal: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '600' },
  divider: { height: 1, backgroundColor: COLORS.surface, marginVertical: 10 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 10,
  },
  empty: { alignItems: 'center', paddingVertical: 24, gap: 6 },
  emptyText: { color: COLORS.textSecondary, fontSize: 13 },
  wdCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFF',
    padding: 14,
    borderRadius: 18,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.surface,
  },
  wdIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wdAmount: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
  wdSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2, textTransform: 'capitalize' },
  wdStatus: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(18,53,36,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    paddingBottom: 32,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.surface,
    alignSelf: 'center',
    marginBottom: 18,
  },
  modalTitle: { fontSize: 22, fontWeight: '800', color: COLORS.textPrimary },
  modalSub: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4, marginBottom: 18 },
  modalInput: {
    backgroundColor: COLORS.bg,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 22,
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.surface,
    fontWeight: '700',
  },
  quickRow: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  quickChip: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  quickChipText: { color: COLORS.primary, fontWeight: '600', fontSize: 13 },
  modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 22 },
  modalBtn: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
  },
  modalCancel: { backgroundColor: COLORS.surface },
  modalCancelText: { color: COLORS.primary, fontWeight: '700' },
  modalConfirm: { backgroundColor: COLORS.accent },
  modalConfirmText: { color: '#FFF', fontWeight: '700' },
});
