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
import { prescriptionHtml, sharePdf } from '../../src/lib/pdf';

export default function PrescriptionView() {
  const router = useRouter();
  const { visitId } = useLocalSearchParams<{ visitId: string }>();
  const [rx, setRx] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!visitId) return;
    const r = await api.getPrescription(visitId);
    setRx(r);
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
          <Text style={styles.label}>E-PRESCRIPTION</Text>
          <Text style={styles.title}>Your Rx</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {!rx ? (
          <View style={styles.empty}>
            <Ionicons name="document-text-outline" size={48} color={COLORS.textDisabled} />
            <Text style={styles.emptyText}>No prescription yet</Text>
            <Text style={styles.emptySub}>
              Your doctor hasn't written a prescription for this visit yet.
            </Text>
          </View>
        ) : (
          <View style={styles.rxCard}>
            <View style={styles.rxHeader}>
              <Text style={styles.rxBrand}>NURTIX</Text>
              <Text style={styles.rxId}>Rx #{rx.id.slice(0, 8).toUpperCase()}</Text>
            </View>

            <View style={styles.rxRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rxKey}>PATIENT</Text>
                <Text style={styles.rxValue}>{rx.patient_name}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rxKey}>DATE</Text>
                <Text style={styles.rxValue}>
                  {new Date(rx.created_at).toLocaleDateString()}
                </Text>
              </View>
            </View>

            <View style={styles.rxDivider} />

            <Text style={styles.rxKey}>DIAGNOSIS</Text>
            <Text style={styles.rxDiagnosis}>{rx.diagnosis}</Text>

            <Text style={[styles.rxKey, { marginTop: 18 }]}>MEDICATIONS</Text>
            {rx.medications?.map((m: any, i: number) => (
              <View key={i} style={styles.medItem} testID={`rx-med-${i}`}>
                <View style={styles.medIdxPill}>
                  <Text style={styles.medIdxText}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.medName}>{m.name}</Text>
                  <Text style={styles.medMeta}>
                    {[m.dosage, m.frequency, m.duration].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </View>
            ))}

            {rx.notes ? (
              <>
                <Text style={[styles.rxKey, { marginTop: 18 }]}>NOTES</Text>
                <Text style={styles.rxNotes}>{rx.notes}</Text>
              </>
            ) : null}

            <View style={styles.rxDivider} />

            <View style={styles.rxFooter}>
              <View>
                <Text style={styles.rxKey}>PRESCRIBED BY</Text>
                <Text style={styles.rxDoctor}>{rx.doctor_name}</Text>
                <Text style={styles.rxSigned}>✓ Digitally signed</Text>
              </View>
              <Ionicons name="medkit" size={28} color={COLORS.primary} />
            </View>
          </View>
        )}
      </ScrollView>
      {rx && (
        <View style={styles.pdfBar}>
          <TouchableOpacity
            testID="download-rx-pdf"
            style={styles.pdfBtn}
            onPress={() => sharePdf(prescriptionHtml(rx), `NURTIX_Rx_${rx.id.slice(0, 8)}.pdf`)}
          >
            <Ionicons name="download-outline" size={18} color="#FFF" />
            <Text style={styles.pdfText}>Download / Share PDF</Text>
          </TouchableOpacity>
        </View>
      )}
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
  rxCard: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: COLORS.surface,
  },
  rxHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  rxBrand: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 4,
    color: COLORS.primary,
  },
  rxId: { fontSize: 11, letterSpacing: 1.5, color: COLORS.textSecondary, fontWeight: '600' },
  rxRow: { flexDirection: 'row', gap: 10, marginBottom: 6 },
  rxKey: {
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  rxValue: { fontSize: 15, fontWeight: '600', color: COLORS.textPrimary },
  rxDivider: { height: 1, backgroundColor: COLORS.surface, marginVertical: 16 },
  rxDiagnosis: { fontSize: 17, fontWeight: '700', color: COLORS.textPrimary, lineHeight: 24 },
  medItem: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surface,
    alignItems: 'center',
  },
  medIdxPill: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medIdxText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  medName: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary },
  medMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  rxNotes: { fontSize: 14, color: COLORS.textPrimary, lineHeight: 22 },
  rxFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rxDoctor: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary, marginTop: 2 },
  rxSigned: { fontSize: 11, color: COLORS.success, fontWeight: '700', marginTop: 4 },
  pdfBar: {
    padding: 16,
    paddingBottom: 24,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: COLORS.surface,
  },
  pdfBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 999,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  pdfText: { color: '#FFF', fontWeight: '700' },
});
