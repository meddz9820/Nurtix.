import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api, storage, COLORS, Visit, Doctor } from '../../../src/lib/api';

interface Med {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
}

export default function PrescriptionWrite() {
  const router = useRouter();
  const { visitId } = useLocalSearchParams<{ visitId: string }>();
  const [visit, setVisit] = useState<Visit | null>(null);
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [diagnosis, setDiagnosis] = useState('');
  const [notes, setNotes] = useState('');
  const [meds, setMeds] = useState<Med[]>([
    { name: '', dosage: '', frequency: '', duration: '' },
  ]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!visitId) return;
    const u = await storage.getUser();
    const [v, all, existing] = await Promise.all([
      api.getVisit(visitId),
      api.listDoctors(),
      api.getPrescription(visitId),
    ]);
    setVisit(v);
    const me =
      all.find((d) => d.name.toLowerCase() === (u?.name || '').toLowerCase()) ||
      all[0];
    setDoctor(me);
    if (existing) {
      setDiagnosis(existing.diagnosis || '');
      setNotes(existing.notes || '');
      setMeds(
        existing.medications?.length
          ? existing.medications
          : [{ name: '', dosage: '', frequency: '', duration: '' }],
      );
    }
    setLoading(false);
  }, [visitId]);

  useEffect(() => {
    load();
  }, [load]);

  const showAlert = (m: string) => {
    if (Platform.OS === 'web') window.alert(m);
    else Alert.alert('NURTIX', m);
  };

  const updateMed = (i: number, field: keyof Med, val: string) => {
    setMeds((m) => m.map((x, idx) => (idx === i ? { ...x, [field]: val } : x)));
  };

  const addMed = () =>
    setMeds((m) => [...m, { name: '', dosage: '', frequency: '', duration: '' }]);

  const removeMed = (i: number) =>
    setMeds((m) => (m.length > 1 ? m.filter((_, idx) => idx !== i) : m));

  const save = async () => {
    if (!visit || !doctor) return;
    if (!diagnosis.trim()) {
      showAlert('Diagnosis is required.');
      return;
    }
    const validMeds = meds.filter((m) => m.name.trim());
    if (validMeds.length === 0) {
      showAlert('Add at least one medication.');
      return;
    }
    setSaving(true);
    try {
      await api.createPrescription({
        visit_id: visit.id,
        doctor_id: doctor.id,
        diagnosis: diagnosis.trim(),
        medications: validMeds,
        notes: notes.trim(),
      });
      showAlert('Prescription saved successfully.');
      router.back();
    } finally {
      setSaving(false);
    }
  };

  if (loading || !visit) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.topRow}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.iconBtn}
            testID="back-button"
          >
            <Ionicons name="chevron-back" size={22} color={COLORS.primary} />
          </TouchableOpacity>
          <View>
            <Text style={styles.label}>E-PRESCRIPTION</Text>
            <Text style={styles.title}>Write Rx</Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 20 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.patientCard}>
            <Ionicons name="person-circle" size={36} color={COLORS.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.patientName}>{visit.patient_name}</Text>
              <Text style={styles.patientSub}>{visit.symptoms}</Text>
            </View>
          </View>

          <Text style={styles.fieldLabel}>DIAGNOSIS *</Text>
          <TextInput
            testID="diagnosis-input"
            value={diagnosis}
            onChangeText={setDiagnosis}
            placeholder="e.g., Acute viral fever"
            placeholderTextColor={COLORS.textDisabled}
            style={styles.input}
          />

          <View style={styles.sectionHead}>
            <Text style={styles.fieldLabel}>MEDICATIONS *</Text>
            <TouchableOpacity onPress={addMed} testID="add-med-button">
              <Text style={styles.addLink}>+ Add</Text>
            </TouchableOpacity>
          </View>

          {meds.map((m, i) => (
            <View key={i} style={styles.medCard} testID={`med-card-${i}`}>
              <View style={styles.medHead}>
                <Text style={styles.medIdx}>Rx {i + 1}</Text>
                {meds.length > 1 && (
                  <TouchableOpacity onPress={() => removeMed(i)}>
                    <Ionicons name="close-circle" size={20} color={COLORS.error} />
                  </TouchableOpacity>
                )}
              </View>
              <TextInput
                testID={`med-name-${i}`}
                value={m.name}
                onChangeText={(v) => updateMed(i, 'name', v)}
                placeholder="Medicine name (e.g., Paracetamol 500mg)"
                placeholderTextColor={COLORS.textDisabled}
                style={styles.medInput}
              />
              <View style={styles.medRow}>
                <TextInput
                  value={m.dosage}
                  onChangeText={(v) => updateMed(i, 'dosage', v)}
                  placeholder="Dosage (1 tab)"
                  placeholderTextColor={COLORS.textDisabled}
                  style={[styles.medInput, { flex: 1 }]}
                />
                <TextInput
                  value={m.frequency}
                  onChangeText={(v) => updateMed(i, 'frequency', v)}
                  placeholder="Frequency (TID)"
                  placeholderTextColor={COLORS.textDisabled}
                  style={[styles.medInput, { flex: 1 }]}
                />
              </View>
              <TextInput
                value={m.duration}
                onChangeText={(v) => updateMed(i, 'duration', v)}
                placeholder="Duration (5 days, after meals)"
                placeholderTextColor={COLORS.textDisabled}
                style={styles.medInput}
              />
            </View>
          ))}

          <Text style={styles.fieldLabel}>NOTES / ADVICE</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Rest, hydration, follow-up instructions..."
            placeholderTextColor={COLORS.textDisabled}
            style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
            multiline
          />

          <TouchableOpacity
            testID="save-prescription"
            style={[styles.cta, saving && { opacity: 0.6 }]}
            onPress={save}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={18} color="#FFF" />
                <Text style={styles.ctaText}>Save prescription</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
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
  patientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFF',
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.surface,
    marginBottom: 18,
  },
  patientName: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
  patientSub: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  fieldLabel: {
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.surface,
    marginBottom: 16,
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  addLink: { color: COLORS.accent, fontWeight: '700', fontSize: 13 },
  medCard: {
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.surface,
    marginBottom: 10,
    gap: 8,
  },
  medHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  medIdx: { fontSize: 11, letterSpacing: 1, fontWeight: '700', color: COLORS.primary },
  medInput: {
    backgroundColor: COLORS.bg,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.surface,
  },
  medRow: { flexDirection: 'row', gap: 8 },
  cta: {
    backgroundColor: COLORS.accent,
    borderRadius: 999,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  ctaText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
