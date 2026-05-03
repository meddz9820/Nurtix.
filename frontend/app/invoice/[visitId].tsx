import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { api, COLORS } from '../../src/lib/api';

export default function InvoiceView() {
  const router = useRouter();
  const { visitId, session_id } = useLocalSearchParams<{
    visitId: string;
    session_id?: string;
  }>();
  const [inv, setInv] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [polling, setPolling] = useState(false);
  const [payStatus, setPayStatus] = useState<string>('');

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

  // Poll payment status if returning from Stripe
  useEffect(() => {
    if (!session_id) return;
    let attempts = 0;
    const maxAttempts = 7;
    const interval = 2000;
    setPolling(true);
    setPayStatus('Confirming payment...');
    const poll = async () => {
      try {
        const s = await api.checkPaymentStatus(session_id as string);
        if (s.payment_status === 'paid') {
          setPayStatus('Payment successful!');
          setPolling(false);
          await load();
          return;
        }
        if (s.status === 'expired') {
          setPayStatus('Session expired.');
          setPolling(false);
          return;
        }
        attempts += 1;
        if (attempts < maxAttempts) setTimeout(poll, interval);
        else {
          setPayStatus('Still processing. Pull to refresh.');
          setPolling(false);
        }
      } catch {
        setPayStatus('Could not confirm payment.');
        setPolling(false);
      }
    };
    poll();
  }, [session_id, load]);

  const showAlert = (m: string) => {
    if (Platform.OS === 'web') window.alert(m);
    else Alert.alert('NURTIX', m);
  };

  const pay = async () => {
    if (!visitId) return;
    setPaying(true);
    try {
      const origin =
        Platform.OS === 'web' && typeof window !== 'undefined'
          ? window.location.origin
          : process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const r = await api.createCheckout(visitId, origin);
      if (r?.url) {
        if (Platform.OS === 'web') {
          window.location.href = r.url;
        } else {
          await WebBrowser.openBrowserAsync(r.url);
          // On native return, manually re-check status using session_id
          const sess = r.session_id;
          if (sess) {
            router.replace(`/invoice/${visitId}?session_id=${sess}`);
          }
        }
      } else {
        showAlert(r?.detail || 'Unable to start checkout.');
      }
    } catch {
      showAlert('Payment could not be started.');
    } finally {
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  const paid = inv?.status === 'paid';

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
          <>
            {polling && (
              <View style={styles.banner} testID="payment-banner">
                <ActivityIndicator color={COLORS.accent} />
                <Text style={styles.bannerText}>{payStatus}</Text>
              </View>
            )}
            {!polling && payStatus && (
              <View style={[styles.banner, paid && { backgroundColor: '#DFF3EA' }]}>
                <Ionicons
                  name={paid ? 'checkmark-circle' : 'information-circle'}
                  size={18}
                  color={paid ? COLORS.success : COLORS.warning}
                />
                <Text style={[styles.bannerText, paid && { color: COLORS.success }]}>
                  {payStatus}
                </Text>
              </View>
            )}

            <View style={styles.card}>
              <View style={styles.header}>
                <View>
                  <Text style={styles.brand}>NURTIX</Text>
                  <Text style={styles.tag}>HOME HEALTHCARE</Text>
                </View>
                <View
                  style={[
                    styles.paidPill,
                    !paid && { backgroundColor: '#FFF4D9' },
                  ]}
                >
                  <Ionicons
                    name={paid ? 'checkmark-circle' : 'time'}
                    size={14}
                    color={paid ? COLORS.success : COLORS.warning}
                  />
                  <Text style={[styles.paidText, !paid && { color: COLORS.warning }]}>
                    {(inv.status || 'pending').toUpperCase()}
                  </Text>
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
                <Text style={styles.k}>Billed to</Text>
                <Text style={styles.v}>{inv.patient_name}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.k}>Doctor</Text>
                <Text style={styles.v}>{inv.doctor_name}</Text>
              </View>

              <View style={styles.divider} />
              <View style={styles.row}>
                <Text style={styles.k}>Home consultation fee</Text>
                <Text style={styles.v}>₹{inv.consultation_fee}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.k}>Service charge (5%)</Text>
                <Text style={styles.v}>₹{inv.service_charge}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.k}>Tax (GST 18%)</Text>
                <Text style={styles.v}>₹{inv.tax}</Text>
              </View>

              <View style={styles.divider} />
              <View style={styles.totalRow}>
                <Text style={styles.tKey}>TOTAL {paid ? 'PAID' : 'DUE'}</Text>
                <Text style={styles.tVal}>₹{inv.total.toLocaleString()}</Text>
              </View>

              <View style={styles.footer}>
                <Text style={styles.fText}>Thank you for choosing NURTIX.</Text>
                <Text style={styles.fSub}>Questions? support@nurtix.com</Text>
              </View>
            </View>

            {!paid && (
              <TouchableOpacity
                testID="pay-now-button"
                style={[styles.payBtn, paying && { opacity: 0.6 }]}
                onPress={pay}
                disabled={paying}
              >
                {paying ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="card" size={18} color="#FFF" />
                    <Text style={styles.payText}>Pay ₹{inv.total.toLocaleString()} with Stripe</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </>
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
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFF4D9',
    padding: 14,
    borderRadius: 14,
    marginBottom: 14,
  },
  bannerText: { flex: 1, color: COLORS.textPrimary, fontWeight: '600', fontSize: 13 },
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
  k: { color: COLORS.textSecondary, fontSize: 14 },
  v: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '600' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    padding: 16,
    borderRadius: 16,
    marginTop: 4,
  },
  tKey: { color: 'rgba(255,255,255,0.7)', fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  tVal: { color: '#FFF', fontSize: 22, fontWeight: '800' },
  footer: { alignItems: 'center', marginTop: 20 },
  fText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '600' },
  fSub: { fontSize: 11, color: COLORS.textDisabled, marginTop: 4 },
  payBtn: {
    marginTop: 16,
    backgroundColor: COLORS.accent,
    borderRadius: 999,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  payText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
