// src/components/ColorPickerModal.tsx
import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import ColorPicker from 'react-native-wheel-color-picker';
import { Dimensions } from 'react-native';
const screenHeight = Dimensions.get('window').height;

type Props = {
  visible: boolean;
  initialColor: string;
  onClose: () => void;
  onSelect: (color: string) => void;
};

export default function ColorPickerModal({
  visible,
  initialColor,
  onClose,
  onSelect,
}: Props) {
  const [tempColor, setTempColor] = useState(initialColor);

  useEffect(() => {
    if (visible) {
      setTempColor(initialColor);
    }
  }, [visible, initialColor]);

  const handleConfirm = () => {
    onSelect(tempColor);
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Pick a color</Text>

          {/* Contenedor con altura fija para que el picker no se desborde */}
          <View style={styles.pickerContainer}>
            {/* Escalamos todo el picker hacia adentro */}
            <View style={styles.pickerScale}>
              <ColorPicker
                color={tempColor}
                onColorChange={setTempColor}
                thumbSize={30}
                sliderSize={28}
                noSnap={true}
                row={false}
                // si no quieres las bolitas de colores:
                // swatches={false}
              />
            </View>
          </View>

          <View style={styles.buttonsRow}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onClose}
              activeOpacity={0.85}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.applyButton]}
              onPress={handleConfirm}
              activeOpacity={0.85}
            >
              <Text style={styles.applyText}>Apply color</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
    color: '#111827',
  },

  pickerContainer: {
    width: '100%',
    height: 280,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },

  pickerScale: {
    transform: [{ scaleX: 0.85 }, { scaleY: 0.9 }],
    alignSelf: 'stretch',
    marginTop: -(screenHeight * 0.25), // sube ~25% de la pantalla
  },

  buttonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    columnGap: 10,
  },
  button: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 999,
  },
  cancelButton: {
    backgroundColor: '#E5E7EB',
  },
  cancelText: {
    color: '#111827',
    fontWeight: '600',
  },
  applyButton: {
    backgroundColor: '#3B5A85',
  },
  applyText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
