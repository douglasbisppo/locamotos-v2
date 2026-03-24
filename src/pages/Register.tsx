import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, Navigate } from 'react-router-dom';
import { supabase } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Bike, Loader2, Upload, CheckCircle2, AlertCircle, MessageSquare, Mail, XCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { isValidCPF } from '@/lib/cpf';

const Register = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { user, loading: authLoading } = useAuth();

  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [registered, setRegistered] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [cpf, setCpf] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [phone, setPhone] = useState('');
  const [cnhFile, setCnhFile] = useState<File | null>(null);
  const [cnhNumero, setCnhNumero] = useState('');
  const [ref1Name, setRef1Name] = useState('');
  const [ref1Phone, setRef1Phone] = useState('');
  const [ref2Name, setRef2Name] = useState('');
  const [ref2Phone, setRef2Phone] = useState('');

  // Address fields
  const [addressZip, setAddressZip] = useState('');
  const [addressStreet, setAddressStreet] = useState('');
  const [addressNumber, setAddressNumber] = useState('');
  const [addressComplement, setAddressComplement] = useState('');
  const [addressNeighborhood, setAddressNeighborhood] = useState('');
  const [addressCity, setAddressCity] = useState('');
  const [addressState, setAddressState] = useState('');

  // WhatsApp verification
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [whatsappVerified, setWhatsappVerified] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  // Email verification
  const [emailOtpCode, setEmailOtpCode] = useState('');
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [sendingEmailOtp, setSendingEmailOtp] = useState(false);
  const [verifyingEmailOtp, setVerifyingEmailOtp] = useState(false);

  // Terms acceptance
  const [termsAccepted, setTermsAccepted] = useState(false);

  // CPF validation state
  const cpfDigits = cpf.replace(/\D/g, '');
  const cpfComplete = cpfDigits.length === 11;
  const cpfValid = cpfComplete && isValidCPF(cpf);
  const cpfShowError = cpfComplete && !cpfValid;

  useEffect(() => {
    const validateToken = async () => {
      if (!token) {
        setValidating(false);
        return;
      }
      const { data, error } = await supabase
        .from('invitations')
        .select('*')
        .eq('token', token)
        .eq('is_used', false)
        .single();

      if (error || !data) {
        setTokenValid(false);
      } else {
        const expiresAt = new Date(data.expires_at);
        setTokenValid(expiresAt > new Date());
      }
      setValidating(false);
    };
    validateToken();
  }, [token]);

  // Check if form is fully valid for submit button
  const formValid = useMemo(() => {
    return (
      name.trim() !== '' &&
      email.trim() !== '' &&
      password.length >= 6 &&
      confirmPassword === password &&
      cpfValid &&
      birthDate !== '' &&
      cnhNumero.trim().length >= 9 &&
      whatsappVerified &&
      emailVerified &&
      cnhFile !== null &&
      addressStreet.trim() !== '' &&
      addressNumber.trim() !== '' &&
      addressNeighborhood.trim() !== '' &&
      addressCity.trim() !== '' &&
      addressState.trim() !== '' &&
      addressZip.replace(/\D/g, '').length === 8 &&
      ref1Name.trim() !== '' &&
      ref1Phone.replace(/\D/g, '').length >= 10 &&
      ref2Name.trim() !== '' &&
      ref2Phone.replace(/\D/g, '').length >= 10 &&
      termsAccepted
    );
  }, [name, email, password, confirmPassword, cpfValid, birthDate, cnhNumero, whatsappVerified, emailVerified, cnhFile, addressStreet, addressNumber, addressNeighborhood, addressCity, addressState, addressZip, ref1Name, ref1Phone, ref2Name, ref2Phone, termsAccepted]);

  if (authLoading || validating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (user) return <Navigate to="/dashboard" replace />;

  if (!token || !tokenValid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto rounded-xl bg-destructive/10 p-3 mb-2">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle className="font-display">Link Inválido</CardTitle>
            <CardDescription>
              {!token
                ? 'Nenhum convite foi fornecido. Você precisa de um link de convite para se cadastrar.'
                : 'Este convite já foi utilizado ou expirou. Solicite um novo convite ao administrador.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <a href="https://wa.me/5521972803625">
              <Button className="w-full gap-2">
                Falar no WhatsApp
              </Button>
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (registered) {
    return <Navigate to="/dashboard" replace />;
  }

  const formatCPF = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  };

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  const formatCEP = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 5) return digits;
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  };

  const handleCEPBlur = async () => {
    const cepDigits = addressZip.replace(/\D/g, '');
    if (cepDigits.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cepDigits}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setAddressStreet(data.logradouro || '');
        setAddressNeighborhood(data.bairro || '');
        setAddressCity(data.localidade || '');
        setAddressState(data.uf || '');
      }
    } catch {
      // silent fail - user can fill manually
    }
  };

  const sendWhatsAppOTP = async () => {
    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length < 10) {
      toast.error('Informe um número de WhatsApp válido.');
      return;
    }
    setSendingOtp(true);
    try {
      const { error } = await supabase.functions.invoke('generate-whatsapp-otp', {
        body: { phone: phoneDigits },
      });
      if (error) throw error;
      setOtpSent(true);
      toast.success('Código enviado para seu WhatsApp!');
    } catch (err: any) {
      toast.error('Erro ao enviar código: ' + (err.message || 'Tente novamente.'));
      setOtpSent(false);
    } finally {
      setSendingOtp(false);
    }
  };

  const verifyOTP = async () => {
    setVerifyingOtp(true);
    try {
      const phoneDigits = phone.replace(/\D/g, '');
      const { data, error } = await supabase.functions.invoke('verify-otp', {
        body: { identifier: `whatsapp:${phoneDigits}`, code: otpCode },
      });
      if (error) throw error;
      if (data?.valid || data?.verified || data?.success) {
        setWhatsappVerified(true);
        toast.success('WhatsApp verificado com sucesso!');
      } else {
        toast.error(data?.error || 'Código incorreto. Tente novamente.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao verificar código.');
    } finally {
      setVerifyingOtp(false);
    }
  };

  const sendEmailOTP = async () => {
    if (!email || !email.includes('@')) {
      toast.error('Informe um e-mail válido.');
      return;
    }
    setSendingEmailOtp(true);
    try {
      const { error } = await supabase.functions.invoke('send-email-otp', {
        body: { email },
      });
      if (error) throw error;
      setEmailOtpSent(true);
      toast.success('Código enviado para seu e-mail!');
    } catch (err: any) {
      toast.error('Erro ao enviar código: ' + (err.message || 'Tente novamente.'));
      setEmailOtpSent(false);
    } finally {
      setSendingEmailOtp(false);
    }
  };

  const verifyEmailOTP = async () => {
    setVerifyingEmailOtp(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-otp', {
        body: { identifier: `email:${email.toLowerCase()}`, code: emailOtpCode },
      });
      if (error) throw error;
      if (data?.valid || data?.verified || data?.success) {
        setEmailVerified(true);
        toast.success('E-mail verificado com sucesso!');
      } else {
        toast.error(data?.error || 'Código incorreto. Tente novamente.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao verificar código.');
    } finally {
      setVerifyingEmailOtp(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cnhFile) {
      toast.error('Envie a foto da sua CNH digital.');
      return;
    }
    if (!cpfValid) {
      toast.error('CPF inválido. Verifique os dígitos.');
      return;
    }
    if (!addressStreet || !addressNumber || !addressNeighborhood || !addressCity || !addressState || !addressZip) {
      toast.error('Preencha o endereço completo.');
      return;
    }
    if (!whatsappVerified) {
      toast.error('Verifique seu WhatsApp antes de continuar.');
      return;
    }
    if (!emailVerified) {
      toast.error('Verifique seu e-mail antes de continuar.');
      return;
    }
    if (!termsAccepted) {
      toast.error('Você precisa aceitar os termos para continuar.');
      return;
    }

    setSubmitting(true);
    try {
      let userId: string | undefined;

      // 1. Try to sign up
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: name },
          emailRedirectTo: 'https://021locamotos.com/auth',
        },
      });

      if (authError) {
        // If user already exists (incomplete previous attempt), try signing in
        if (authError.message?.toLowerCase().includes('already') || authError.message?.toLowerCase().includes('já')) {
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
          if (signInError) throw new Error('Este e-mail já está cadastrado. Verifique suas credenciais.');
          userId = signInData.user?.id;
        } else {
          throw authError;
        }
      } else {
        userId = authData.user?.id;
        // Sign in to get active session (needed for RLS)
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      }

      if (!userId) throw new Error('Erro ao criar conta.');

      // 2. Upload CNH
      const ext = cnhFile.name.split('.').pop();
      const filePath = `${userId}/cnh.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('cnh-documents')
        .upload(filePath, cnhFile, { upsert: true });
      if (uploadError) throw uploadError;

      // 3. Upsert profile with all fields (creates row if missing, role is handled by trigger)
      const profilePayload = {
        user_id: userId,
        display_name: name,
        email,
        cpf: cpfDigits,
        birth_date: birthDate,
        phone: phone.replace(/\D/g, ''),
        cnh_url: filePath,
        cnh_numero: cnhNumero,
        reference_contact_1_name: ref1Name,
        reference_contact_1_phone: ref1Phone.replace(/\D/g, ''),
        reference_contact_2_name: ref2Name,
        reference_contact_2_phone: ref2Phone.replace(/\D/g, ''),
        invitation_token: token,
        whatsapp_verified: true,
        admin_approved: false,
        address_street: addressStreet,
        address_number: addressNumber,
        address_complement: addressComplement,
        address_neighborhood: addressNeighborhood,
        address_city: addressCity,
        address_state: addressState,
        address_zip: addressZip.replace(/\D/g, ''),
      };

      const { error: profileError } = await supabase
        .from('profiles')
        .upsert(profilePayload, { onConflict: 'user_id' });
      if (profileError) throw profileError;

      // 4. Mark invitation as used
      await supabase
        .from('invitations')
        .update({ is_used: true, used_by: userId, used_at: new Date().toISOString() })
        .eq('token', token);

      // Notify admin about new registration
      supabase.functions.invoke('notify-admin-new-user', {
        body: { userName: name, userEmail: email },
      }).catch(() => {}); // fire and forget

      // User stays logged in — redirect to dashboard where they'll see "Aguardando Aprovação"
      toast.success('Cadastro realizado com sucesso!');
      setRegistered(true);
    } catch (err: any) {
      toast.error(err.message || 'Erro no cadastro.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-lg space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="rounded-xl bg-primary p-3">
            <Bike className="h-8 w-8 text-accent" />
          </div>
          <h1 className="text-2xl font-bold font-display tracking-tight text-foreground">021 Loca Motos</h1>
          <p className="text-muted-foreground text-sm">Complete seu cadastro</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-display">Dados Pessoais</CardTitle>
            <CardDescription>Preencha todos os campos para finalizar seu cadastro.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="name">Nome Completo *</Label>
                <Input id="name" placeholder="Seu nome completo" value={name} onChange={e => setName(e.target.value)} required />
              </div>

              {/* Email with verification */}
              <div className="space-y-3 rounded-lg border border-border p-4">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Verificação de E-mail
                </h3>
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail *</Label>
                  <div className="flex gap-2">
                    <Input
                      id="email"
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={e => {
                        setEmail(e.target.value);
                        // Reset verification if email changes
                        if (emailVerified) {
                          setEmailVerified(false);
                          setEmailOtpSent(false);
                          setEmailOtpCode('');
                        }
                      }}
                      required
                      disabled={emailVerified}
                    />
                    {!emailVerified && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={sendEmailOTP}
                        disabled={sendingEmailOtp || !email || !email.includes('@')}
                        className="shrink-0"
                      >
                        {sendingEmailOtp ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enviar Código'}
                      </Button>
                    )}
                  </div>
                </div>
                {emailOtpSent && !emailVerified && (
                  <div className="space-y-2">
                    <Label htmlFor="emailOtpCode">Código recebido no e-mail *</Label>
                    <div className="flex gap-2">
                      <Input
                        id="emailOtpCode"
                        placeholder="000000"
                        value={emailOtpCode}
                        onChange={e => setEmailOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        maxLength={6}
                      />
                      <Button type="button" variant="outline" onClick={verifyEmailOTP} disabled={verifyingEmailOtp} className="shrink-0">
                        {verifyingEmailOtp ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verificar'}
                      </Button>
                    </div>
                  </div>
                )}
                {emailVerified && (
                  <div className="flex items-center gap-2 text-success text-sm font-medium">
                    <CheckCircle2 className="h-4 w-4" />
                    E-mail verificado com sucesso!
                  </div>
                )}
              </div>

              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor="password">Senha *</Label>
                <Input id="password" type="password" placeholder="Mínimo 6 caracteres" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
              </div>

              {/* Confirm Password */}
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar Senha *</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Repita sua senha"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  className={confirmPassword && confirmPassword !== password ? 'border-destructive' : confirmPassword && confirmPassword === password ? 'border-success' : ''}
                />
                {confirmPassword && confirmPassword !== password && (
                  <p className="text-sm text-destructive flex items-center gap-1">
                    <XCircle className="h-3 w-3" />
                    As senhas não coincidem.
                  </p>
                )}
                {confirmPassword && confirmPassword === password && (
                  <p className="text-sm text-success flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Senhas coincidem!
                  </p>
                )}
              </div>

              {/* CPF with real-time validation */}
              <div className="space-y-2">
                <Label htmlFor="cpf">CPF *</Label>
                <div className="relative">
                  <Input
                    id="cpf"
                    placeholder="000.000.000-00"
                    value={cpf}
                    onChange={e => setCpf(formatCPF(e.target.value))}
                    required
                    className={cpfShowError ? 'border-destructive pr-10' : cpfValid ? 'border-success pr-10' : ''}
                  />
                  {cpfComplete && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {cpfValid ? (
                        <CheckCircle2 className="h-4 w-4 text-success" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive" />
                      )}
                    </div>
                  )}
                </div>
                {cpfShowError && (
                  <p className="text-xs text-destructive font-medium">CPF inválido. Verifique os dígitos.</p>
                )}
                {cpfValid && (
                  <p className="text-xs text-success font-medium">CPF válido ✓</p>
                )}
              </div>

              {/* Birth date */}
              <div className="space-y-2">
                <Label htmlFor="birthDate">Data de Nascimento *</Label>
                <Input id="birthDate" type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} required />
              </div>

              {/* Phone / WhatsApp */}
              <div className="space-y-3 rounded-lg border border-border p-4">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Verificação de WhatsApp
                </h3>
                <div className="space-y-2">
                  <Label htmlFor="phone">Número do WhatsApp *</Label>
                  <div className="flex gap-2">
                    <Input
                      id="phone"
                      placeholder="(21) 99999-9999"
                      value={phone}
                      onChange={e => setPhone(formatPhone(e.target.value))}
                      required
                      disabled={whatsappVerified}
                    />
                    {!whatsappVerified && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={sendWhatsAppOTP}
                        disabled={sendingOtp || phone.replace(/\D/g, '').length < 10}
                        className="shrink-0"
                      >
                        {sendingOtp ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enviar Código'}
                      </Button>
                    )}
                  </div>
                </div>
                {otpSent && !whatsappVerified && (
                  <div className="space-y-2">
                    <Label htmlFor="otpCode">Código recebido no WhatsApp *</Label>
                    <div className="flex gap-2">
                      <Input
                        id="otpCode"
                        placeholder="000000"
                        value={otpCode}
                        onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        maxLength={6}
                      />
                      <Button type="button" variant="outline" onClick={verifyOTP} disabled={verifyingOtp} className="shrink-0">
                        {verifyingOtp ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verificar'}
                      </Button>
                    </div>
                  </div>
                )}
                {whatsappVerified && (
                  <div className="flex items-center gap-2 text-success text-sm font-medium">
                    <CheckCircle2 className="h-4 w-4" />
                    WhatsApp verificado com sucesso!
                  </div>
                )}
              </div>

              {/* Address section */}
              <div className="space-y-3 rounded-lg border border-border p-4">
                <h3 className="text-sm font-semibold text-foreground">Endereço Completo</h3>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="addressZip">CEP *</Label>
                    <Input
                      id="addressZip"
                      placeholder="00000-000"
                      value={addressZip}
                      onChange={e => setAddressZip(formatCEP(e.target.value))}
                      onBlur={handleCEPBlur}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="addressState">Estado *</Label>
                    <Input id="addressState" placeholder="RJ" value={addressState} onChange={e => setAddressState(e.target.value)} required maxLength={2} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="addressStreet">Rua / Logradouro *</Label>
                  <Input id="addressStreet" placeholder="Rua das Flores" value={addressStreet} onChange={e => setAddressStreet(e.target.value)} required />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="addressNumber">Número *</Label>
                    <Input id="addressNumber" placeholder="123" value={addressNumber} onChange={e => setAddressNumber(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="addressComplement">Complemento</Label>
                    <Input id="addressComplement" placeholder="Apto 101" value={addressComplement} onChange={e => setAddressComplement(e.target.value)} />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="addressNeighborhood">Bairro *</Label>
                    <Input id="addressNeighborhood" placeholder="Centro" value={addressNeighborhood} onChange={e => setAddressNeighborhood(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="addressCity">Cidade *</Label>
                    <Input id="addressCity" placeholder="Rio de Janeiro" value={addressCity} onChange={e => setAddressCity(e.target.value)} required />
                  </div>
                </div>
              </div>

              {/* CNH Number */}
              <div className="space-y-2">
                <Label htmlFor="cnhNumero">Número da CNH *</Label>
                <Input
                  id="cnhNumero"
                  placeholder="00000000000"
                  value={cnhNumero}
                  onChange={e => setCnhNumero(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  required
                  maxLength={11}
                />
              </div>

              {/* CNH Upload */}
              <div className="space-y-2">
                <Label htmlFor="cnh">CNH Digital (foto) *</Label>
                <div className="flex items-center gap-3">
                  <label
                    htmlFor="cnh"
                    className="flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
                  >
                    <Upload className="h-4 w-4" />
                    {cnhFile ? cnhFile.name : 'Selecionar arquivo'}
                  </label>
                  <input
                    id="cnh"
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={e => setCnhFile(e.target.files?.[0] || null)}
                  />
                </div>
              </div>

              {/* References */}
              <div className="space-y-3 rounded-lg border border-border p-4">
                <h3 className="text-sm font-semibold text-foreground">Contatos de Referência</h3>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="ref1Name">Nome Ref. 1 *</Label>
                    <Input id="ref1Name" placeholder="Nome" value={ref1Name} onChange={e => setRef1Name(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ref1Phone">Telefone Ref. 1 *</Label>
                    <Input id="ref1Phone" placeholder="(21) 99999-9999" value={ref1Phone} onChange={e => setRef1Phone(formatPhone(e.target.value))} required />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="ref2Name">Nome Ref. 2 *</Label>
                    <Input id="ref2Name" placeholder="Nome" value={ref2Name} onChange={e => setRef2Name(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ref2Phone">Telefone Ref. 2 *</Label>
                    <Input id="ref2Phone" placeholder="(21) 99999-9999" value={ref2Phone} onChange={e => setRef2Phone(formatPhone(e.target.value))} required />
                  </div>
                </div>
              </div>

              {/* Terms acceptance */}
              <div className="flex items-start gap-3 rounded-lg border border-border p-4">
                <Checkbox
                  id="terms"
                  checked={termsAccepted}
                  onCheckedChange={(checked) => setTermsAccepted(checked === true)}
                  className="mt-0.5"
                />
                <label htmlFor="terms" className="text-sm text-muted-foreground cursor-pointer leading-relaxed">
                  Li e aceito os{' '}
                  <a href="/termos-de-uso" target="_blank" rel="noopener noreferrer" className="text-foreground font-medium underline hover:text-accent">
                    termos de uso
                  </a>{' '}
                  e a{' '}
                  <a href="/politica-de-privacidade" target="_blank" rel="noopener noreferrer" className="text-foreground font-medium underline hover:text-accent">
                    política de privacidade
                  </a>{' '}
                  da 021 Loca Motos. Declaro que todas as informações fornecidas são verdadeiras.
                </label>
              </div>

              <Button type="submit" className="w-full" disabled={submitting || !formValid}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Finalizar Cadastro
              </Button>

              {!formValid && (
                <p className="text-xs text-muted-foreground text-center">
                  Preencha todos os campos, verifique e-mail e WhatsApp, e aceite os termos para habilitar o botão.
                </p>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Register;
