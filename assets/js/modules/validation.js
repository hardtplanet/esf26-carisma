// Validation Module for ESF 26 Carisma Manager
// Provides validation functions for form inputs

const validation = {
  // CNS validation (15 digits)
  validateCNS: (cns) => {
    if (!cns) return { valid: false, message: 'CNS é obrigatório' };
    const cleanCNS = cns.replace(/\s/g, '');
    if (!/^\d{15}$/.test(cleanCNS)) {
      return { valid: false, message: 'CNS deve conter exatamente 15 dígitos' };
    }
    return { valid: true, message: '' };
  },

  // CPF validation (11 digits with checksum)
  validateCPF: (cpf) => {
    if (!cpf) return { valid: false, message: 'CPF é obrigatório' };
    const cleanCPF = cpf.replace(/\s|\.|-/g, '');
    if (!/^\d{11}$/.test(cleanCPF)) {
      return { valid: false, message: 'CPF deve conter exatamente 11 dígitos' };
    }
    
    // Check for known invalid patterns
    if (/^(\d)\1{10}$/.test(cleanCPF)) {
      return { valid: false, message: 'CPF inválido' };
    }
    
    // Calculate first verification digit
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += parseInt(cleanCPF.charAt(i)) * (10 - i);
    }
    let remainder = (sum * 10) % 11;
    if (remainder === 10 || remainder === 11) remainder = 0;
    if (remainder !== parseInt(cleanCPF.charAt(9))) {
      return { valid: false, message: 'CPF inválido' };
    }
    
    // Calculate second verification digit
    sum = 0;
    for (let i = 0; i < 10; i++) {
      sum += parseInt(cleanCPF.charAt(i)) * (11 - i);
    }
    remainder = (sum * 10) % 11;
    if (remainder === 10 || remainder === 11) remainder = 0;
    if (remainder !== parseInt(cleanCPF.charAt(10))) {
      return { valid: false, message: 'CPF inválido' };
    }
    
    return { valid: true, message: '' };
  },

  // Date validation (YYYY-MM-DD format)
  validateDate: (date) => {
    if (!date) return { valid: false, message: 'Data é obrigatória' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { valid: false, message: 'Data deve estar no formato AAAA-MM-DD' };
    }
    
    const [year, month, day] = date.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    
    // Check if it's a valid date
    if (dateObj.getFullYear() !== year || 
        dateObj.getMonth() !== month - 1 || 
        dateObj.getDate() !== day) {
      return { valid: false, message: 'Data inválida' };
    }
    
    return { valid: true, message: '' };
  },

  // Phone number validation (Brazilian format)
  validatePhone: (phone) => {
    if (!phone) return { valid: true, message: '' }; // Optional field
    const cleanPhone = phone.replace(/\s|\(|\)|\-/g, '');
    if (!/^\d{10,11}$/.test(cleanPhone)) {
      return { valid: false, message: 'Telefone deve ter 10 ou 11 dígitos' };
    }
    return { valid: true, message: '' };
  },

  // Required field validation
  validateRequired: (value, fieldName) => {
    if (!value || value.trim() === '') {
      return { valid: false, message: `${fieldName} é obrigatório` };
    }
    return { valid: true, message: '' };
  },

  // Age validation (reasonable range)
  validateAge: (age) => {
    if (!age) return { valid: false, message: 'Idade é obrigatória' };
    const ageNum = parseInt(age);
    if (isNaN(ageNum)) {
      return { valid: false, message: 'Idade deve ser um número' };
    }
    if (ageNum < 0 || ageNum > 120) {
      return { valid: false, message: 'Idade deve estar entre 0 e 120 anos' };
    }
    return { valid: true, message: '' };
  },

  // Generic validation function
  validateField: (value, type, fieldName) => {
    switch (type) {
      case 'cns': return validation.validateCNS(value);
      case 'cpf': return validation.validateCPF(value);
      case 'date': return validation.validateDate(value);
      case 'phone': return validation.validatePhone(value);
      case 'required': return validation.validateRequired(value, fieldName);
      case 'age': return validation.validateAge(value);
      default: return { valid: true, message: '' };
    }
  }
};

// Export for use in other modules
window.validation = validation;