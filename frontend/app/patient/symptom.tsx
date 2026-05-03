import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api, storage, COLORS } from '../../src/lib/api';

interface Msg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export default function SymptomChecker() {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [userTurns, setUserTurns] = useState(0);
  const [readyForReport, setReadyForReport] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    (async () => {
      const u = await storage.getUser();
      const sid = `sym-${u?.id || 'anon'}-${Date.now()}`;
      setSessionId(sid);
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: `Hi${u ? ' ' + u.name.split(' ')[0] : ''}! I'm here to help you decide if a home doctor visit is needed. What's been bothering you today?`,
        },
      ]);
    })();
  }, []);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg: Msg = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: input.trim(),
    };
    setMessages((m) => [...m, userMsg]);
    const text = input.trim();
    setInput('');
    setLoading(true);
    try {
      const r = await api.sendSymptom(sessionId, text);
      setMessages((m) => [
        ...m,
        { id: r.message_id, role: 'assistant', content: r.reply },
      ]);
      if (typeof r.user_turns === 'number') setUserTurns(r.user_turns);
      if (r.ready_for_report) setReadyForReport(true);
    } catch (e) {
      setMessages((m) => [
        ...m,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          content: 'Sorry, I had trouble. Could you try again?',
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.iconCircle}>
          <Ionicons name="sparkles" size={20} color={COLORS.accent} />
        </View>
        <View>
          <Text style={styles.label}>AI TRIAGE</Text>
          <Text style={styles.title}>Symptom Checker</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.chatList}
          contentContainerStyle={{ paddingVertical: 16, paddingBottom: 24 }}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.map((m) => (
            <View
              key={m.id}
              style={[
                styles.bubble,
                m.role === 'user' ? styles.userBubble : styles.aiBubble,
              ]}
              testID={`chat-msg-${m.role}`}
            >
              <Text style={m.role === 'user' ? styles.userText : styles.aiText}>
                {m.content}
              </Text>
            </View>
          ))}
          {loading && (
            <View style={[styles.bubble, styles.aiBubble]}>
              <ActivityIndicator color={COLORS.primary} size="small" />
            </View>
          )}
        </ScrollView>

        <View style={styles.inputRow}>
          <TextInput
            testID="symptom-input"
            style={styles.input}
            placeholder="Describe your symptoms..."
            placeholderTextColor={COLORS.textDisabled}
            value={input}
            onChangeText={setInput}
            multiline
            onSubmitEditing={send}
          />
          <TouchableOpacity
            testID="symptom-send-button"
            style={[styles.sendBtn, !input.trim() && { opacity: 0.4 }]}
            disabled={!input.trim() || loading}
            onPress={send}
          >
            <Ionicons name="arrow-up" size={20} color="#FFF" />
          </TouchableOpacity>
        </View>

        {readyForReport && (
          <TouchableOpacity
            testID="generate-report-button"
            style={styles.reportCta}
            onPress={() => router.push(`/patient/report/${sessionId}`)}
          >
            <Ionicons name="document-text" size={18} color="#FFF" />
            <Text style={styles.reportCtaText}>
              Generate AI report & request a doctor
            </Text>
            <Ionicons name="arrow-forward" size={16} color="#FFF" />
          </TouchableOpacity>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingHorizontal: 20 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 8,
    paddingBottom: 12,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFE6E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 10, letterSpacing: 3, color: COLORS.textSecondary },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.textPrimary },
  chatList: { flex: 1 },
  bubble: { padding: 14, borderRadius: 18, marginVertical: 6, maxWidth: '85%' },
  userBubble: {
    backgroundColor: COLORS.primary,
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    backgroundColor: '#FFF',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.surface,
  },
  userText: { color: '#FFF', fontSize: 15, lineHeight: 22 },
  aiText: { color: COLORS.textPrimary, fontSize: 15, lineHeight: 22 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingVertical: 10,
    paddingBottom: 14,
  },
  input: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.surface,
    maxHeight: 120,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 999,
    paddingVertical: 14,
    marginBottom: 14,
  },
  reportCtaText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
});
