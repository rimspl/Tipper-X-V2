function voiceStep({ id, title, hint, overlay, expectedFields, required = true }) {
  return {
    id,
    title,
    hint,
    overlay,
    mediaKind: 'audio',
    required,
    expectedFields
  };
}

export const FORM_DEFINITIONS = {
  tyre_card: {
    label: 'Tyre Card',
    icon: '🪪',
    subtitle: 'Speak fitment details including odometer, RTD, and tyre condition.',
    backgroundFields: [
      { key: 'tyre_serial', label: 'Tyre Serial' },
      { key: 'vehicle_no', label: 'Vehicle No' },
      { key: 'position_code', label: 'Position Code' },
      { key: 'make', label: 'Brand' },
      { key: 'model', label: 'Tyre Model' },
      { key: 'size', label: 'Size' },
      { key: 'meter_reading', label: 'Odometer/HMR Reading' },
      { key: 'rtd1', label: 'RTD 1' },
      { key: 'rtd2', label: 'RTD 2' },
      { key: 'fitment_type', label: 'Tyre Condition (New/Old)' }
    ],
    steps: [
      voiceStep({
        id: 'tyre_serial_voice',
        title: 'Tyre Serial Voice',
        hint: 'Speak only the tyre serial clearly, letter by letter for alphabets.',
        overlay: 'Example: E C P zero one two one S eight A. Or: S five N zero zero two six zero five.',
        expectedFields: ['tyre_serial']
      }),
      voiceStep({
        id: 'make_voice',
        title: 'Brand Voice',
        hint: 'Speak the tyre brand name.',
        overlay: 'Example: Michelin. Or: Bridgestone. Or: BKT. Or: Apollo.',
        expectedFields: ['make']
      }),
      voiceStep({
        id: 'model_voice',
        title: 'Model Voice',
        hint: 'Speak the tyre model name.',
        overlay: 'Example: XDR3-B. Or: V-STEEL R-LUG S. Or: VREP.',
        expectedFields: ['model'],
        required: false
      }),
      voiceStep({
        id: 'size_voice',
        title: 'Size Voice',
        hint: 'Speak the tyre size exactly.',
        overlay: 'Example: Twenty seven R forty nine. Or: Twelve R twenty two point five.',
        expectedFields: ['size']
      }),
      voiceStep({
        id: 'vehicle_no_voice',
        title: 'Vehicle Number Voice',
        hint: 'Speak truck/equipment number clearly.',
        overlay: 'Example: GRN zero one. Or: GRN twenty three. Or: DT zero five.',
        expectedFields: ['vehicle_no']
      }),
      voiceStep({
        id: 'position_code_voice',
        title: 'Position Code Voice',
        hint: 'Speak tyre position code.',
        overlay: 'Example: Front Left. Or: Axle three left outer. Or: AX4RI.',
        expectedFields: ['position_code']
      }),
      voiceStep({
        id: 'meter_reading_voice',
        title: 'Odometer / HMR Reading Voice',
        hint: 'Speak odometer or hour meter reading as a number.',
        overlay: 'Example: Twenty three thousand four sixty eight. Or: Five thousand five hundred.',
        expectedFields: ['meter_reading']
      }),
      voiceStep({
        id: 'rtd1_voice',
        title: 'RTD1 Voice',
        hint: 'Speak first tread depth value in millimeters.',
        overlay: 'Example: RTD one is eighty. Or: Sixty six point five.',
        expectedFields: ['rtd1']
      }),
      voiceStep({
        id: 'rtd2_voice',
        title: 'RTD2 Voice',
        hint: 'Speak second tread depth value in millimeters.',
        overlay: 'Example: RTD two is seventy eight. Or: Sixty two.',
        expectedFields: ['rtd2']
      }),
      voiceStep({
        id: 'fitment_type_voice',
        title: 'Tyre Condition Voice',
        hint: 'Speak tyre condition: new or old.',
        overlay: 'Example: Tyre condition is new.',
        expectedFields: ['fitment_type']
      })
    ]
  },
  pressure_check: {
    label: 'Pressure Check',
    icon: '🔵',
    subtitle: 'Speak truck, position, tyre number, and found pressure.',
    backgroundFields: [
      { key: 'vehicle_no', label: 'Vehicle No' },
      { key: 'position_code', label: 'Position Code' },
      { key: 'tyre_serial', label: 'Tyre Serial' },
      { key: 'found_psi', label: 'Found PSI' },
      { key: 'target_psi', label: 'Target PSI' }
    ],
    steps: [
      voiceStep({
        id: 'vehicle_no_voice',
        title: 'Vehicle Number Voice',
        hint: 'Speak truck/equipment number clearly.',
        overlay: 'Example: GRN zero one. Or: DT fifteen.',
        expectedFields: ['vehicle_no']
      }),
      voiceStep({
        id: 'position_code_voice',
        title: 'Position Code Voice',
        hint: 'Speak position code clearly.',
        overlay: 'Example: Front Left. Or: Axle four right inner.',
        expectedFields: ['position_code']
      }),
      voiceStep({
        id: 'tyre_serial_voice',
        title: 'Tyre Serial Voice',
        hint: 'Speak tyre serial clearly, letter by letter for alphabets.',
        overlay: 'Example: E C P zero one two one S eight A.',
        expectedFields: ['tyre_serial']
      }),
      voiceStep({
        id: 'found_psi_voice',
        title: 'Found PSI Voice',
        hint: 'Speak measured tyre pressure in PSI.',
        overlay: 'Example: Found PSI is one hundred and ten. Or: Ninety five.',
        expectedFields: ['found_psi']
      })
    ]
  },
  tyre_inspection: {
    label: 'Tyre Inspection',
    icon: '🔍',
    subtitle: 'Speak inspection details with odometer, RTD values, and remarks.',
    backgroundFields: [
      { key: 'tyre_serial', label: 'Tyre Serial' },
      { key: 'vehicle_no', label: 'Vehicle No' },
      { key: 'position_code', label: 'Position Code' },
      { key: 'meter_reading', label: 'Odometer/HMR Reading' },
      { key: 'rtd1', label: 'RTD 1' },
      { key: 'rtd2', label: 'RTD 2' },
      { key: 'remarks', label: 'Inspection Remark' }
    ],
    steps: [
      voiceStep({
        id: 'tyre_serial_voice',
        title: 'Tyre Serial Voice',
        hint: 'Speak the tyre serial, letter by letter for alphabets.',
        overlay: 'Example: S five N zero zero two six zero five. Or: E C P zero one two one S eight A.',
        expectedFields: ['tyre_serial']
      }),
      voiceStep({
        id: 'vehicle_no_voice',
        title: 'Vehicle Number Voice',
        hint: 'Speak vehicle/equipment number.',
        overlay: 'Example: GRN zero one. Or: GRN thirty one.',
        expectedFields: ['vehicle_no']
      }),
      voiceStep({
        id: 'position_code_voice',
        title: 'Position Code Voice',
        hint: 'Speak wheel position code.',
        overlay: 'Example: Front Left. Or: Axle three right outer. Or: AX4RI.',
        expectedFields: ['position_code']
      }),
      voiceStep({
        id: 'meter_reading_voice',
        title: 'Odometer / HMR Reading Voice',
        hint: 'Speak current odometer or hour meter reading.',
        overlay: 'Example: Twenty four thousand four seventy nine. Or: Five thousand five hundred.',
        expectedFields: ['meter_reading']
      }),
      voiceStep({
        id: 'rtd1_voice',
        title: 'RTD1 Voice',
        hint: 'Speak first tread depth value in millimeters.',
        overlay: 'Example: RTD one is sixty. Or: Seventy eight. Or: Forty five.',
        expectedFields: ['rtd1']
      }),
      voiceStep({
        id: 'rtd2_voice',
        title: 'RTD2 Voice',
        hint: 'Speak second tread depth value in millimeters.',
        overlay: 'Example: RTD two is fifty seven. Or: Sixty two.',
        expectedFields: ['rtd2']
      }),
      voiceStep({
        id: 'remarks_voice',
        title: 'Inspection Remark Voice',
        hint: 'Speak inspection remark — cuts, cracks, separation, or running condition.',
        overlay: 'Example: Separation at shoulder crown. Or: Running condition good.',
        expectedFields: ['remarks'],
        required: false
      })
    ]
  },
  tyre_removal: {
    label: 'Tyre Removal',
    icon: '🔴',
    subtitle: 'Speak removal details and final odometer/RTD values.',
    backgroundFields: [
      { key: 'vehicle_no', label: 'Vehicle No' },
      { key: 'position_code', label: 'Position Code' },
      { key: 'tyre_serial', label: 'Tyre Serial' },
      { key: 'current_reading', label: 'Odometer/HMR Reading' },
      { key: 'removal_reason', label: 'Removal Reason' },
      { key: 'rtd1', label: 'Final RTD1' },
      { key: 'rtd2', label: 'Final RTD2' },
      { key: 'remarks', label: 'Remarks' }
    ],
    steps: [
      voiceStep({
        id: 'vehicle_no_voice',
        title: 'Vehicle Number Voice',
        hint: 'Speak vehicle/equipment number clearly.',
        overlay: 'Example: GRN zero one. Or: DT twelve.',
        expectedFields: ['vehicle_no']
      }),
      voiceStep({
        id: 'position_code_voice',
        title: 'Position Code Voice',
        hint: 'Speak tyre position code.',
        overlay: 'Example: Front Left. Or: Axle three right outer.',
        expectedFields: ['position_code']
      }),
      voiceStep({
        id: 'tyre_serial_voice',
        title: 'Tyre Serial Voice',
        hint: 'Speak tyre serial clearly, letter by letter for alphabets.',
        overlay: 'Example: E C P zero one two one S eight A.',
        expectedFields: ['tyre_serial']
      }),
      voiceStep({
        id: 'current_reading_voice',
        title: 'Odometer / HMR Reading Voice',
        hint: 'Speak current odometer or hour meter reading.',
        overlay: 'Example: Seven thousand sixty one. Or: Twenty four thousand.',
        expectedFields: ['current_reading']
      }),
      voiceStep({
        id: 'removal_reason_voice',
        title: 'Removal Reason Voice',
        hint: 'Speak reason: scrap, repair, spare, claim, or worn out.',
        overlay: 'Example: Scrap. Or: Separation at shoulder crown. Or: Worn out.',
        expectedFields: ['removal_reason']
      }),
      voiceStep({
        id: 'rtd1_voice',
        title: 'Final RTD1 Voice',
        hint: 'Speak final tread depth A in millimeters.',
        overlay: 'Example: Final RTD1 is fourteen. Or: Twenty four.',
        expectedFields: ['rtd1']
      }),
      voiceStep({
        id: 'rtd2_voice',
        title: 'Final RTD2 Voice',
        hint: 'Speak final tread depth B in millimeters.',
        overlay: 'Example: Final RTD2 is twelve. Or: Twenty five.',
        expectedFields: ['rtd2']
      }),
      voiceStep({
        id: 'remarks_voice',
        title: 'Remarks Voice',
        hint: 'Speak additional remarks about damage or condition.',
        overlay: 'Example: Separation heat shoulder crown. Or: Sidewall cut near bead area.',
        expectedFields: ['remarks'],
        required: false
      })
    ]
  },
  observation: {
    label: 'Observation',
    icon: '📝',
    subtitle: 'Speak observation fields to auto-fill structured records.',
    backgroundFields: [
      { key: 'vehicle_no', label: 'Vehicle No' },
      { key: 'position_code', label: 'Position Code' },
      { key: 'category', label: 'Category' },
      { key: 'subcategory', label: 'Sub-category' },
      { key: 'summary_text', label: 'Summary' },
      { key: 'risk_level', label: 'Risk Level' },
      { key: 'suggested_action', label: 'Suggested Action' }
    ],
    steps: [
      voiceStep({
        id: 'vehicle_no_voice',
        title: 'Vehicle Number Voice',
        hint: 'Speak vehicle number.',
        overlay: 'Example: Vehicle number KA 01 AB 1234.',
        expectedFields: ['vehicle_no']
      }),
      voiceStep({
        id: 'position_code_voice',
        title: 'Position Code Voice',
        hint: 'Speak observed position code.',
        overlay: 'Example: Position code FR.',
        expectedFields: ['position_code']
      }),
      voiceStep({
        id: 'category_voice',
        title: 'Category Voice',
        hint: 'Speak category: Safety, Wear, Pressure, or Fitment.',
        overlay: 'Example: Category is Safety.',
        expectedFields: ['category']
      }),
      voiceStep({
        id: 'subcategory_voice',
        title: 'Sub-category Voice',
        hint: 'Speak sub-category in taxonomy.',
        overlay: 'Example: Sub-category is Sidewall Cut.',
        expectedFields: ['subcategory']
      }),
      voiceStep({
        id: 'summary_text_voice',
        title: 'Summary Voice',
        hint: 'Speak concise issue summary.',
        overlay: 'Example: Sidewall has a deep cut near shoulder area.',
        expectedFields: ['summary_text']
      }),
      voiceStep({
        id: 'risk_level_voice',
        title: 'Risk Level Voice',
        hint: 'Speak risk level: High, Medium, or Low.',
        overlay: 'Example: Risk level is High.',
        expectedFields: ['risk_level']
      }),
      voiceStep({
        id: 'suggested_action_voice',
        title: 'Suggested Action Voice',
        hint: 'Speak recommended action.',
        overlay: 'Example: Replace tyre before next trip.',
        expectedFields: ['suggested_action']
      })
    ]
  }
};

export function getFormDefinition(formType) {
  const normalized = String(formType || '').trim().toLowerCase();
  return FORM_DEFINITIONS[normalized] || null;
}

export function listForms() {
  return Object.entries(FORM_DEFINITIONS).map(([key, value]) => ({
    formType: key,
    ...value
  }));
}

export function resolveFormSteps(formType) {
  const form = getFormDefinition(formType);
  if (!form) {
    return [];
  }

  return Array.isArray(form.steps) ? form.steps : [];
}
