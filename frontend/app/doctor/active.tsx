import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api, storage, COLORS, Doctor, Visit } from '../../src/lib/api';

const NEXT_STATUS: Record<string, string> = {
  accepted: 'en_route',
  en_route: 'arrived',
  arrived: 'completed',
};

const NEXT_LABEL: Record<string, string> = {
  accepted: 'Start trip',
  en_route: 'I have arrived',
  arrived: 'Mark completed',
};

export default function ActiveJobs() {
  const router = useRouter();
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [active, setActive] = useState<Visit[]>([]);
  const [rxMap, setRxMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const u = await storage.getUser();
    if (!u) return;
    const all = await api.listDoctors();
    const me =
      all.find((d) => d.name.toLowerCase() === u.name.toLowerCase()) || all[0];
    setDoctor(me);
    if (me) {
      const a = await api.doctorActive(me.id);
      setActive(a);
      const rxResults = await Promise.all(
        a.map((v) => api.getPrescription(v.id).then((r) => [v.id, !!r] as const)),
      );
      setRxMap(Object.fromEntries(rxResults));
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const showAlert = (m: string) => {
    if (Platform.OS === 'web') window.alert(m);
    else Alert.alert('NURTIX', m);
  };

  const advance = async (v: Visit) => {
    const next = NEXT_STATUS[v.status];
    if (!next) return;
    if (next === 'completed' && !rxMap[v.id]) {
      showAlert('Please write a prescription before marking the visit completed.');
      return;
    }
    setUpdating(v.id);
    try {
      await api.updateStatus(v.id, next);
      await load();
    } finally {
      setUpdating(null);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center' }]}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={{ paddingTop: 8, paddingBottom: 14 }}>
        <Text style={styles.label}>IN PROGRESS</Text>
        <Text style={styles.title}>Active Jobs</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 30 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
      >
        {active.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="navigate-outline" size={40} color={COLORS.textDisabled} />
            <Text style={styles.emptyText}>No active jobs</Text>
            <Text style={styles.emptySub}>
              Accept a request from the Feed to start a visit.
            </Text>
          </View>
        ) : (
          active.map((v) => {
            const hasRx = rxMap[v.id];
            return (
              <View key={v.id} style={styles.card} testID={`active-${v.id}`}>
                <View style={styles.row}>
                  <View style={styles.statusDot} />
                  <Text style={styles.statusText}>{v.status.toUpperCase()}</Text>
                  {v.eta_minutes && <Text style={styles.eta}>ETA {v.eta_minutes} min</Text>}
                </View>
                <Text style={styles.patient}>{v.patient_name}</Text>
                <Text style={styles.symptoms}>{v.symptoms}</Text>

                {v.symptom_summary && (
                  <View style={styles.aiPanel}>
                    <View style={styles.aiHead}>
                      <Ionicons name="sparkles" size={12} color={COLORS.accent} />
                      <Text style={styles.aiHeadText}>AI TRIAGE REPORT</Text>
                    </View>
                    <Text style={styles.aiSummary}>
                      {v.symptom_summary.patient_summary}
                    </Text>
                    {(v.symptom_summary.key_symptoms || []).length > 0 && (
                      <View style={styles.chips}>
                        {(v.symptom_summary.key_symptoms || []).map((s: string, i: number) => (
                          <View key={i} style={styles.chip}>
                            <Text style={styles.chipText}>{s}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                    {(v.symptom_summary.suggested_initial_medications || []).length > 0 && (
                      <Text style={styles.aiMeds}>
                        Suggested OTC:{' '}
                        {(v.symptom_summary.suggested_initial_medications || [])
                          .map((m: any) => m.name)
                          .join(', ')}
                      </Text>
                    )}
                  </View>
                )}

                <View style={styles.addrRow}>
                  <Ionicons name="location" size={14} color={COLORS.primary} />
                  <Text style={styles.addr}>{v.address}</Text>
                </View>

                {/* Prescription button - appears from accepted onwards */}
                <TouchableOpacity
                  testID={`write-rx-${v.id}`}
                  style={[styles.rxBtn, hasRx && { backgroundColor: '#DFF3EA', borderColor: COLORS.success }]}
                  onPress={() => router.push(`/doctor/prescription/${v.id}`)}
                >
                  <Ionicons
                    name={hasRx ? 'checkmark-circle' : 'create-outline'}
                    size={18}
                    color={hasRx ? COLORS.success : COLORS.primary}
                  />
                  <Text style={[styles.rxBtnText, hasRx && { color: COLORS.success }]}>
                    {hasRx ? 'Prescription saved · Edit' : 'Write e-prescription'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.cta, updating === v.id && { opacity: 0.6 }]}
                  onPress={() => advance(v)}
                  disabled={updating === v.id}
                  testID={`advance-button-${v.id}`}
                >
                  {updating === v.id ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.ctaText}>{NEXT_LABEL[v.status] || 'Update'}</Text>
                  )}
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingHorizontal: 20 },
  label: { fontSize: 10, letterSpacing: 3, color: COLORS.textSecondary },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.textPrimary },
  empty: { alignItems: 'center', paddingTop: 60, gap: 6 },
  emptyText: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary, marginTop: 10 },
  emptySub: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 30,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 22,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.surface,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.accent },
  statusText: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: COLORS.textPrimary },
  eta: { marginLeft: 'auto', color: COLORS.accent, fontWeight: '700', fontSize: 13 },
  patient: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary },
  symptoms: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4 },
  aiPanel: {
    backgroundColor: COLORS.bg,
    borderRadius: 14,
    padding: 12,
    marginTop: 12,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
  },
  aiHead: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  aiHeadText: { color: COLORS.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  aiSummary: { fontSize: 12, color: COLORS.textPrimary, lineHeight: 17 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  chip: { backgroundColor: COLORS.surface, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  chipText: { color: COLORS.primary, fontSize: 11, fontWeight: '600' },
  aiMeds: { fontSize: 11, color: COLORS.primary, marginTop: 6, fontWeight: '600', fontStyle: 'italic' },
  addrRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  addr: { fontSize: 13, color: COLORS.textPrimary, flex: 1 },
  rxBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 999,
    marginTop: 14,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.surface,
  },
  rxBtnText: { color: COLORS.primary, fontWeight: '700', fontSize: 14 },
  cta: {
    backgroundColor: COLORS.primary,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  ctaText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
});
