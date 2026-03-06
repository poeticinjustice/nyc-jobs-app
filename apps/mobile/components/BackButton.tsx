import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';

export default function BackButton() {
  const router = useRouter();

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  return (
    <TouchableOpacity style={styles.button} onPress={goBack} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
      <Text style={styles.text}>← Back</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    minWidth: 70,
  },
  text: {
    fontSize: 17,
    color: '#3B82F6',
    fontWeight: '500',
  },
});
