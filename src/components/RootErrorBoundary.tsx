import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { recordCaughtError } from '@/lib/crash-guard';

interface RootErrorBoundaryProps {
  children: React.ReactNode;
}

interface RootErrorBoundaryState {
  errorMessage: string | null;
}

/** Top-level fallback boundary to prevent silent white-screen crashes on unexpected render errors. */
export class RootErrorBoundary extends React.Component<RootErrorBoundaryProps, RootErrorBoundaryState> {
  state: RootErrorBoundaryState = { errorMessage: null };

  static getDerivedStateFromError(error: Error): RootErrorBoundaryState {
    return { errorMessage: error?.message || String(error) };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    recordCaughtError('RootErrorBoundary', error, info.componentStack ?? undefined);
  }

  private handleReset = () => {
    this.setState({ errorMessage: null });
  };

  render(): React.ReactNode {
    if (!this.state.errorMessage) {
      return this.props.children;
    }

    return (
      <View style={styles.container}>
        <Text style={styles.title}>Something went wrong</Text>
        <ScrollView style={styles.box} contentContainerStyle={styles.boxContent}>
          <Text selectable style={styles.message}>
            {this.state.errorMessage}
          </Text>
        </ScrollView>
        <Pressable onPress={this.handleReset} style={styles.button}>
          <Text style={styles.buttonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#18181b',
    gap: 16,
  },
  title: {
    color: '#fafafa',
    fontSize: 18,
    fontWeight: '700',
  },
  box: {
    width: '100%',
    maxHeight: 220,
    backgroundColor: '#27272a',
    borderRadius: 10,
  },
  boxContent: {
    padding: 12,
  },
  message: {
    color: '#e4e4e7',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  button: {
    backgroundColor: '#fafafa',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  buttonText: {
    color: '#18181b',
    fontSize: 14,
    fontWeight: '700',
  },
});
