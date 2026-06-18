import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api, storage, COLORS } from '../../src/lib/api';

interface Step {
  key: 'category' | 'duration' | 'severity';
  label: string;
  question: string;
  options: string[];
}

const STEPS: Step[] = [
  {
    key: 'category',
    label: 'Question 1 of 3',
    question: 'What is your primary symptom category?',
    options: [
      'Fever/Chills',
      'Cough/Respiratory',
      'Body Aches/Pain',
      'Gastrointestinal',
      'Other',
    ],
  },
  {
    key: 'duration',
    label: 'Question 2 of 3',
    question: 'How long have you been experiencing these symptoms?',
    options: [
      'Less than 24 hours',
      '1-3 days',
      '4-7 days',
      'More than a week',
    ],
  },
  {
    key: 'severity',
    label: 'Question 3 of 3',
    question: 'How would you rate the severity of your discomfort?',
    options: ['Mild', 'Moderate', 'Severe'],
  },
];

export default function SymptomMcqWizard() {
  const router = useRouter();
  const [stepIdx, setStepIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [sessionId, setSessionId] = useState('');

  useEffect(() => {
    (async () => {
      const u = await storage.getUser();
      setSessionId(`mcq-${u?.id || 'anon'}-${Date.now()}`);
    })();
  }, []);

  const step = STEPS[stepIdx];

  const pick = async (option: string) => {
    const updated = { ...answers, [step.key]: option };
    setAnswers(updated);
    if (stepIdx < STEPS.length - 1) {
      setTimeout(() => setStepIdx(stepIdx + 1), 200);
      return;
    }
    // last step → submit
    setSubmitting(true);
    try {
      const u = await storage.getUser();
      const report = await api.generateMcqReport(sessionId, {
        symptom_category: updated.category,
        duration: updated.duration,
        severity: updated.severity,
        patient_name: u?.name || 'Patient',
      });
      if (report?.id) {
        router.replace(`/patient/report/${sessionId}`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const back = () => {
    if (stepIdx === 0) router.back();
    else setStepIdx(stepIdx - 1);
  };

  if (submitting) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <View style={styles.loadingIcon}>
          <Ionicons name="sparkles" size={32} color={COLORS.accent} />
        </View>
        <Text style={styles.loadingTitle}>Generating your AI Report...</Text>
        <Text style={styles.loadingSub}>Synthesizing your responses with NURTIX Triage AI</Text>
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 24 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topRow}>
        <TouchableOpacity onPress={back} style={styles.iconBtn} testID="back-button">
          <Ionicons name="chevron-back" size={22} color={COLORS.primary} />
        </TouchableOpacity>
        <View>
          <Text style={styles.label}>AI TRIAGE</Text>
          <Text style={styles.title}>Symptom Checker</Text>
        </View>
      </View>

      <View style={styles.progressBar}>
        {STEPS.map((s, i) => (
          <View
            key={s.key}
            style={[
              styles.progressDot,
              i <= stepIdx && { backgroundColor: COLORS.accent },
            ]}
          />
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.qLabel}>{step.label}</Text>
        <Text style={styles.qText}>{step.question}</Text>

        <View style={styles.options}>
          {step.options.map((opt) => {
            const selected = answers[step.key] === opt;
            return (
              <TouchableOpacity
                key={opt}
                testID={`option-${step.key}-${opt.replace(/\s/g, '-')}`}
                style={[styles.option, selected && styles.optionSelected]}
                onPress={() => pick(opt)}
                activeOpacity={0.85}
              >
                <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                  {opt}
                </Text>
                <Ionicons
                  name={selected ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={selected ? COLORS.accent : COLORS.textDisabled}
                />
              </TouchableOpacity>
            );
          })}
        </View>
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
    paddingBottom: 8,
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
  progressBar: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  progressDot: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.surface,
  },
  body: { padding: 20, paddingTop: 12, paddingBottom: 40 },
  qLabel: { fontSize: 11, letterSpacing: 2, color: COLORS.accent, fontWeight: '800' },
  qText: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginTop: 8,
    marginBottom: 24,
    lineHeight: 30,
  },
  options: { gap: 10 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF',
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.surface,
  },
  optionSelected: {
    borderColor: COLORS.accent,
    backgroundColor: '#FFF5F2',
  },
  optionText: { fontSize: 16, color: COLORS.textPrimary, fontWeight: '600' },
  optionTextSelected: { color: COLORS.accent },
  loadingIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFF5F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  loadingTitle: { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary, textAlign: 'center' },
  loadingSub: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 30,
  },
});
