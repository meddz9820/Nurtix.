import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ImageBackground,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api, storage, COLORS, Role } from '../src/lib/api';

const BG_URL =
  'https://static.prod-images.emergentagent.com/jobs/f08a18ff-24d5-457c-8a3e-02c34daf0994/images/292fcae8a974008c8d2e57ff724f345c23a25fcb1736196eeaa311ce6fb384e1.png';

export default function Index() {
  const router = useRouter();
  const [step, setStep] = useState<'role' | 'login'>('role');
  const [role, setRole] = useState<Role>('patient');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [bootChecking, setBootChecking] = useState(true);

  useEffect(() => {
    (async () => {
      const u = await storage.getUser();
      if (u) {
        router.replace(u.role === 'patient' ? '/patient' : '/doctor');
      } else {
        setBootChecking(false);
      }
    })();
  }, []);

  const handleLogin = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const user = await api.login(name.trim(), role);
      await storage.setUser(user);
      router.replace(role === 'patient' ? '/patient' : '/doctor');
    } finally {
      setLoading(false);
    }
  };

  if (bootChecking) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ImageBackground source={{ uri: BG_URL }} style={styles.bg} resizeMode="cover">
        <View style={styles.overlay} />
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <Text style={styles.brand}>NURTIX</Text>
            <Text style={styles.tag}>HOME DOCTORS · IN MINUTES</Text>
          </View>

          {step === 'role' ? (
            <View style={styles.roleSection}>
              <Text style={styles.heading}>Care that{'\n'}comes to you.</Text>
              <Text style={styles.sub}>Verified doctors at your door in under 30 minutes.</Text>

              <View style={styles.roleCards}>
                <TouchableOpacity
                  testID="role-selector-patient"
                  style={styles.roleCardPatient}
                  onPress={() => {
                    setRole('patient');
                    setStep('login');
                  }}
                  activeOpacity={0.85}
                >
                  <Ionicons name="medkit" size={28} color="#FFF" />
                  <Text style={styles.roleTitleLight}>I need a doctor</Text>
                  <Text style={styles.roleSubLight}>Book a home visit</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  testID="role-selector-doctor"
                  style={styles.roleCardDoctor}
                  onPress={() => {
                    setRole('doctor');
                    setStep('login');
                  }}
                  activeOpacity={0.85}
                >
                  <Ionicons name="briefcase" size={26} color={COLORS.primary} />
                  <Text style={styles.roleTitleDark}>I'm a doctor</Text>
                  <Text style={styles.roleSubDark}>Find nearby jobs</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.loginSection}>
              <TouchableOpacity onPress={() => setStep('role')} style={styles.backBtn}>
                <Ionicons name="chevron-back" size={22} color={COLORS.primary} />
                <Text style={styles.backText}>Back</Text>
              </TouchableOpacity>

              <Text style={styles.heading}>
                {role === 'patient' ? 'Welcome' : 'Doctor sign-in'}
              </Text>
              <Text style={styles.sub}>Enter your full name to continue.</Text>

              <TextInput
                testID="login-name-input"
                style={styles.input}
                placeholder={role === 'patient' ? 'e.g. Priya Sharma' : 'e.g. Dr. Aisha Patel'}
                placeholderTextColor={COLORS.textDisabled}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />

              <TouchableOpacity
                testID="login-continue-button"
                style={[styles.cta, !name.trim() && { opacity: 0.5 }]}
                disabled={!name.trim() || loading}
                onPress={handleLogin}
                activeOpacity={0.9}
              >
                {loading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <>
                    <Text style={styles.ctaText}>Continue</Text>
                    <Ionicons name="arrow-forward" size={18} color="#FFF" />
                  </>
                )}
              </TouchableOpacity>

              {role === 'doctor' && (
                <Text style={styles.hint}>
                  Try: "Dr. Aisha Patel", "Dr. Marcus Chen", "Dr. Sara Iyer"
                </Text>
              )}
            </View>
          )}
        </SafeAreaView>
      </ImageBackground>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: COLORS.bg },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(248,247,244,0.55)' },
  container: { flex: 1, paddingHorizontal: 24, justifyContent: 'space-between' },
  header: { paddingTop: 12 },
  brand: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 4,
    color: COLORS.primary,
  },
  tag: {
    fontSize: 11,
    letterSpacing: 3,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  roleSection: { paddingBottom: 24 },
  heading: {
    fontSize: 40,
    fontWeight: '800',
    color: COLORS.textPrimary,
    lineHeight: 44,
    letterSpacing: -1,
  },
  sub: { fontSize: 16, color: COLORS.textSecondary, marginTop: 12, marginBottom: 28 },
  roleCards: { gap: 14 },
  roleCardPatient: {
    backgroundColor: COLORS.primary,
    borderRadius: 28,
    padding: 24,
    minHeight: 130,
    justifyContent: 'space-between',
  },
  roleCardDoctor: {
    backgroundColor: '#FFF',
    borderRadius: 28,
    padding: 24,
    minHeight: 130,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: COLORS.surface,
  },
  roleTitleLight: { color: '#FFF', fontSize: 22, fontWeight: '700', marginTop: 18 },
  roleSubLight: { color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  roleTitleDark: { color: COLORS.primary, fontSize: 22, fontWeight: '700', marginTop: 18 },
  roleSubDark: { color: COLORS.textSecondary, marginTop: 4 },

  loginSection: { paddingBottom: 24 },
  backBtn: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  backText: { color: COLORS.primary, fontWeight: '600', marginLeft: 2 },
  input: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 16,
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.surface,
    marginBottom: 16,
  },
  cta: {
    backgroundColor: COLORS.accent,
    borderRadius: 999,
    paddingVertical: 18,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  ctaText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  hint: { color: COLORS.textSecondary, fontSize: 12, marginTop: 14, textAlign: 'center' },
});
