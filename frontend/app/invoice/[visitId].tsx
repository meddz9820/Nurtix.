import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api, COLORS } from '../../src/lib/api';

export default function InvoiceView() {
  const router = useRouter();
  const { visitId } = useLocalSearchParams<{ visitId: string }>();
  const [inv, setInv] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!visitId) return;
    const r = await api.getInvoice(visitId);
    setInv(r);
    setLoading(false);
  }, [visitId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="back-button">
          <Ionicons name="chevron-back" size={22} color={COLORS.primary} />
        </TouchableOpacity>
        <View>
          <Text style={styles.label}>E-INVOICE</Text>
          <Text style={styles.title}>Receipt</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {!inv ? (
          <View style={styles.empty}>
            <Ionicons name="receipt-outline" size={48} color={COLORS.textDisabled} />
            <Text style={styles.emptyText}>No invoice available</Text>
            <Text style={styles.emptySub}>
              Invoice is generated after the visit is completed.
            </Text>
          </View>
        ) : (
          <View style={styles.card}>
            <View style={styles.header}>
              <View>
                <Text style={styles.brand}>NURTIX</Text>
                <Text style={styles.tag}>HOME HEALTHCARE</Text>
              </View>
              <View style={styles.paidPill}>
                <Ionicons name="checkmark-circle" size={14} color={COLORS.success} />
                <Text style={styles.paidText}>{inv.status.toUpperCase()}</Text>
              </View>
            </View>

            <View style={styles.metaRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.metaKey}>INVOICE</Text>
                <Text style={styles.metaVal}>#{inv.id.slice(0, 8).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.metaKey}>DATE</Text>
                <Text style={styles.metaVal}>
                  {new Date(inv.issued_at).toLocaleDateString()}
                </Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.row}>
              <Text style={styles.key}>Billed to</Text>
              <Text style={styles.val}>{inv.patient_name}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.key}>Doctor</Text>
              <Text style={styles.val}>{inv.doctor_name}</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.row}>
              <Text style={styles.key}>Home consultation fee</Text>
              <Text style={styles.val}>₹{inv.consultation_fee}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.key}>Service charge (5%)</Text>
              <Text style={styles.val}>₹{inv.service_charge}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.key}>Tax (GST 18%)</Text>
              <Text style={styles.val}>₹{inv.tax}</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.totalRow}>
              <Text style={styles.totalKey}>TOTAL PAID</Text>
              <Text style={styles.totalVal}>₹{inv.total.toLocaleString()}</Text>
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>Thank you for choosing NURTIX.</Text>
              <Text style={styles.footerSub}>
                Questions? support@nurtix.com
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 10, letterSpacing: 3, color: COLORS.textSecondary },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.textPrimary },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary, marginTop: 12 },
  emptySub: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 30,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: COLORS.surface,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 22,
  },
  brand: { fontSize: 22, fontWeight: '900', letterSpacing: 4, color: COLORS.primary },
  tag: { fontSize: 9, letterSpacing: 2, color: COLORS.textSecondary, marginTop: 2 },
  paidPill: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    backgroundColor: '#DFF3EA',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  paidText: { color: COLORS.success, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  metaRow: { flexDirection: 'row', gap: 10, marginBottom: 6 },
  metaKey: { fontSize: 10, letterSpacing: 2, color: COLORS.textSecondary, fontWeight: '700' },
  metaVal: { fontSize: 14, color: COLORS.textPrimary, fontWeight: '700', marginTop: 4 },
  divider: { height: 1, backgroundColor: COLORS.surface, marginVertical: 14 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  key: { color: COLORS.textSecondary, fontSize: 14 },
  val: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '600' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    padding: 16,
    borderRadius: 16,
    marginTop: 4,
  },
  totalKey: { color: 'rgba(255,255,255,0.7)', fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  totalVal: { color: '#FFF', fontSize: 22, fontWeight: '800' },
  footer: { alignItems: 'center', marginTop: 20 },
  footerText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '600' },
  footerSub: { fontSize: 11, color: COLORS.textDisabled, marginTop: 4 },
});
