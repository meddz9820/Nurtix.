import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api, storage, COLORS } from '../../../src/lib/api';

const URGENCY_COLOR: Record<string, string> = {
  routine: COLORS.success,
  urgent: COLORS.warning,
  asap: COLORS.accent,
};

const TRIAGE_LABEL: Record<string, string> = {
  home_visit: 'Home visit recommended',
  emergency: 'Emergency care required',
  self_care: 'Self-care may suffice',
};

export default function SymptomReport() {
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);

  const load = useCallback(async () => {
    if (!sessionId) return;
    let r = await api.getReport(sessionId);
    if (!r) {
      r = await api.generateReport(sessionId);
    }
    setReport(r);
    setLoading(false);
  }, [sessionId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const showAlert = (m: string) => {
    if (Platform.OS === 'web') window.alert(m);
    else Alert.alert('NURTIX', m);
  };

  const bookVisit = async () => {
    if (!report) return;
    const u = await storage.getUser();
    if (!u) {
      router.replace('/');
      return;
    }
    setBooking(true);
    try {
      const visit = await api.createVisit({
        patient_id: u.id,
        patient_name: u.name,
        address: '12, Linden Avenue, Indiranagar',
        symptoms: report.chief_complaint,
        urgency: report.urgency || 'urgent',
        patient_location: { lat: 12.9716, lng: 77.5946 },
        symptom_report_id: report.id,
      });
      if (visit?.id) {
        router.replace(`/tracking/${visit.id}`);
      } else {
        showAlert('Could not request doctor. Try again.');
      }
    } finally {
      setBooking(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={COLORS.primary} />
        <Text style={styles.loadingText}>Generating your AI report...</Text>
      </View>
    );
  }

  if (!report) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text>Report could not be generated.</Text>
      </View>
    );
  }

  const isEmergency = report.triage_recommendation === 'emergency';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="back-button">
          <Ionicons name="chevron-back" size={22} color={COLORS.primary} />
        </TouchableOpacity>
        <View>
          <Text style={styles.label}>AI TRIAGE REPORT</Text>
          <Text style={styles.title}>Your Summary</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
        {isEmergency && (
          <View style={styles.emergencyBanner} testID="emergency-banner">
            <Ionicons name="warning" size={20} color="#FFF" />
            <Text style={styles.emergencyText}>
              Red flags detected. Please call an ambulance immediately.
            </Text>
          </View>
        )}

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.chief}>{report.chief_complaint}</Text>
            <View
              style={[
                styles.urgPill,
                { backgroundColor: URGENCY_COLOR[report.urgency] || COLORS.warning },
              ]}
            >
              <Text style={styles.urgPillText}>{(report.urgency || '').toUpperCase()}</Text>
            </View>
          </View>

          <View style={styles.metaRow}>
            <View style={styles.metaCell}>
              <Text style={styles.k}>DURATION</Text>
              <Text style={styles.v}>{report.duration || '—'}</Text>
            </View>
            <View style={styles.metaCell}>
              <Text style={styles.k}>SEVERITY</Text>
              <Text style={styles.v}>{(report.severity || '—').toUpperCase()}</Text>
            </View>
          </View>

          <Text style={styles.k}>SUMMARY</Text>
          <Text style={styles.summary} testID="report-summary">
            {report.patient_summary}
          </Text>

          {report.key_symptoms?.length ? (
            <>
              <Text style={[styles.k, { marginTop: 14 }]}>KEY SYMPTOMS</Text>
              <View style={styles.chipsRow}>
                {report.key_symptoms.map((s: string, i: number) => (
                  <View key={i} style={styles.chip}>
                    <Text style={styles.chipText}>{s}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {report.red_flags?.length ? (
            <>
              <Text style={[styles.k, { marginTop: 14, color: COLORS.error }]}>
                RED FLAGS
              </Text>
              {report.red_flags.map((s: string, i: number) => (
                <View key={i} style={styles.flagRow}>
                  <Ionicons name="alert-circle" size={16} color={COLORS.error} />
                  <Text style={styles.flagText}>{s}</Text>
                </View>
              ))}
            </>
          ) : null}

          {report.suggested_initial_medications?.length ? (
            <>
              <Text style={[styles.k, { marginTop: 14 }]}>SUGGESTED INITIAL CARE (OTC)</Text>
              {report.suggested_initial_medications.map((m: any, i: number) => (
                <View key={i} style={styles.medRow}>
                  <View style={styles.medBullet}>
                    <Ionicons name="medkit" size={14} color="#FFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.medName}>{m.name}</Text>
                    {m.reason ? <Text style={styles.medReason}>{m.reason}</Text> : null}
                  </View>
                </View>
              ))}
              <Text style={styles.disclaimer}>
                * OTC suggestions for reference only. Your attending doctor will issue the final prescription.
              </Text>
            </>
          ) : null}

          <View style={styles.triageBar}>
            <Ionicons
              name={isEmergency ? 'alert-circle' : 'medkit'}
              size={18}
              color={isEmergency ? COLORS.error : COLORS.success}
            />
            <Text style={styles.triageText}>
              {TRIAGE_LABEL[report.triage_recommendation] || 'Home visit recommended'}
            </Text>
          </View>
        </View>
      </ScrollView>

      {!isEmergency && (
        <View style={styles.bottomBar}>
          <TouchableOpacity
            testID="book-with-report-button"
            style={[styles.cta, booking && { opacity: 0.6 }]}
            onPress={bookVisit}
            disabled={booking}
          >
            {booking ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Ionicons name="medkit" size={18} color="#FFF" />
                <Text style={styles.ctaText}>Send report & book doctor</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { justifyContent: 'center', alignItems: 'center', gap: 14 },
  loadingText: { color: COLORS.textSecondary, fontSize: 14 },
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
  emergencyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.error,
    padding: 14,
    borderRadius: 16,
    marginBottom: 14,
  },
  emergencyText: { color: '#FFF', fontWeight: '700', fontSize: 13, flex: 1 },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.surface,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  chief: { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary, flex: 1 },
  urgPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  urgPillText: { color: '#FFF', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  metaRow: { flexDirection: 'row', gap: 16, marginVertical: 12 },
  metaCell: { flex: 1 },
  k: {
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  v: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary, marginTop: 4 },
  summary: {
    marginTop: 6,
    fontSize: 14,
    color: COLORS.textPrimary,
    lineHeight: 22,
  },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  chipText: { color: COLORS.primary, fontSize: 12, fontWeight: '600' },
  flagRow: { flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 6 },
  flagText: { color: COLORS.error, fontSize: 13, flex: 1 },
  medRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    marginTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surface,
  },
  medBullet: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medName: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
  medReason: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  disclaimer: {
    color: COLORS.textDisabled,
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 10,
  },
  triageBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.bg,
    padding: 12,
    borderRadius: 14,
    marginTop: 18,
  },
  triageText: { color: COLORS.textPrimary, fontWeight: '700', fontSize: 13, flex: 1 },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    paddingBottom: 32,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: COLORS.surface,
  },
  cta: {
    backgroundColor: COLORS.accent,
    borderRadius: 999,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  ctaText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
