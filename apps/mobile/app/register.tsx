import React, { useState } from 'react';
import { View, Text, TextInput, Button, Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/auth/AuthContext';
import { NAME_MAX, PASSWORD_MIN } from 'nyc-jobs-shared/constants';

export default function RegisterScreen() {
  const router = useRouter();
  const { register } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    if (!firstName.trim()) {
      Alert.alert('Missing fields', 'Please enter your first name.');
      return;
    }
    if (!lastName.trim()) {
      Alert.alert('Missing fields', 'Please enter your last name.');
      return;
    }
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      Alert.alert('Missing fields', 'Please enter your email.');
      return;
    }
    if (password.length < PASSWORD_MIN) {
      Alert.alert('Weak password', `Password must be at least ${PASSWORD_MIN} characters.`);
      return;
    }

    setSubmitting(true);
    try {
      await register({
        email: trimmedEmail,
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      router.replace('/');
    } catch (e: any) {
      const message =
        e?.response?.data?.message || 'Unable to create account. Please try again.';
      Alert.alert('Sign up failed', message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create account</Text>

      <TextInput
        placeholder="First name"
        value={firstName}
        onChangeText={setFirstName}
        style={styles.input}
        maxLength={NAME_MAX}
      />
      <TextInput
        placeholder="Last name"
        value={lastName}
        onChangeText={setLastName}
        style={styles.input}
        maxLength={NAME_MAX}
      />
      <TextInput
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        style={styles.input}
      />
      <TextInput
        placeholder={`Password (min ${PASSWORD_MIN} characters)`}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        style={styles.input}
      />

      <Button
        title={submitting ? 'Creating...' : 'Sign Up'}
        onPress={onSubmit}
        disabled={submitting}
      />

      <View style={styles.footer}>
        <Button title="Back" color="#6B7280" onPress={() => router.back()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    marginBottom: 24,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  footer: {
    marginTop: 16,
  },
});
