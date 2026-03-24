import { Bike, Shield, Clock, CheckCircle, Calendar, CreditCard, FileText, Wrench, Headphones, ChevronDown, ArrowRight, Phone, MapPin, Star } from 'lucide-react';
import WhatsAppIcon from '@/components/WhatsAppIcon';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import hondaCg160 from '@/assets/honda-cg-160-fan.png';

const faqs = [
  { q: 'Preciso ter CNH para alugar?', a: 'Sim, é necessário possuir CNH categoria A válida e digital para retirar a moto.' },
  { q: 'A manutenção está incluída?', a: 'Sim! 50% da manutenção preventiva e corretiva está inclusa no plano. IPVA e seguro são por nossa conta.' },
  { q: 'Como funciona o pagamento semanal?', a: 'O pagamento é feito semanalmente via PIX ou cartão. Você paga a primeira semana antecipada na retirada.' },
  { q: 'Posso devolver a moto antes do prazo?', a: 'Sim, mas o contrato mínimo é de 24 meses. Consulte as condições de devolução antecipada.' },
  { q: 'A moto vem com seguro?', a: 'Sim! Toda a frota possui seguro e IPVA pagos pela 021 Loca Motos.' },
  { q: 'O que acontece se a moto quebrar?', a: 'Entre em contato pelo WhatsApp e resolveremos o mais rápido possível com nossa rede de suporte.' },
  { q: 'Preciso me preocupar com documentação?', a: 'Não! Toda a documentação e burocracia é feita pela 021 Loca Motos, você só precisa trabalhar.' },
];

const FaqItem = ({ q, a }: { q: string; a: string }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-[hsl(222,30%,20%)] rounded-xl overflow-hidden mb-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between p-5 text-left hover:bg-[hsl(222,30%,14%)] transition-colors"
      >
        <span className="font-semibold text-[hsl(210,40%,98%)] text-sm md:text-base">{q}</span>
        <ChevronDown className={`h-5 w-5 text-accent shrink-0 ml-4 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-5 pb-5">
          <p className="text-[hsl(220,9%,55%)] leading-relaxed text-sm">{a}</p>
        </div>
      )}
    </div>
  );
};

const LandingPreview = () => {
  return (
    <div className="min-h-screen bg-[hsl(222,47%,6%)] text-[hsl(210,40%,98%)]">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[hsl(222,47%,6%)]/95 backdrop-blur-md border-b border-[hsl(222,30%,14%)]">
        <div className="container mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-accent p-2">
              <Bike className="h-5 w-5 text-accent-foreground" />
            </div>
            <span className="text-lg font-bold font-display tracking-tight">021 Loca Motos</span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-sm">
            <a href="#planos" className="text-[hsl(220,9%,55%)] hover:text-[hsl(210,40%,98%)] transition-colors">Planos</a>
            <a href="#beneficios" className="text-[hsl(220,9%,55%)] hover:text-[hsl(210,40%,98%)] transition-colors">Benefícios</a>
            <a href="#faq" className="text-[hsl(220,9%,55%)] hover:text-[hsl(210,40%,98%)] transition-colors">Dúvidas</a>
            <Link to="/auth" className="text-[hsl(220,9%,55%)] hover:text-[hsl(210,40%,98%)] transition-colors font-medium">Area do Cliente</Link>
            <a href="https://wa.me/5521972803625?text=Ol%C3%A1%20quero%20saber%20mais%20informa%C3%A7%C3%B5es." target="_blank" rel="noopener noreferrer">
              <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90 gap-1.5 rounded-full px-5">
                <WhatsAppIcon className="h-4 w-4" />
                WhatsApp
              </Button>
            </a>
          </nav>
          {/* Mobile CTA */}
          <a href="https://wa.me/5521972803625?text=Ol%C3%A1%20quero%20saber%20mais%20informa%C3%A7%C3%B5es." target="_blank" rel="noopener noreferrer" className="md:hidden">
            <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-full px-4">
              <WhatsAppIcon className="h-4 w-4" />
            </Button>
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(222,47%,11%)] via-[hsl(222,47%,8%)] to-[hsl(222,47%,4%)]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-accent/5 blur-3xl" />
        <div className="container mx-auto px-4 pt-16 md:pt-20 pb-0 relative z-10">
          <div className="text-center space-y-5 mx-auto">
            <h1 className="text-[clamp(2.5rem,7vw,6rem)] font-bold font-display tracking-tight leading-none">
              LOCAÇÃO DE <span className="text-accent">MOTOS</span>
            </h1>
            <p className="text-lg text-[hsl(220,9%,55%)] max-w-lg mx-auto leading-relaxed">
              Tenha sua moto pagando semanalmente, sem burocracia. IPVA, seguro e manutenção inclusos.
            </p>
            <div className="inline-flex items-center gap-2 rounded-full bg-accent/10 border border-accent/20 px-4 py-2 text-sm font-semibold text-accent">
              <Star className="h-4 w-4 fill-accent" />
              Plano Fidelidade — No final, a moto é sua!
            </div>
            <div className="flex justify-center py-6">
              <img src={hondaCg160} alt="Honda CG 160 Fan" className="max-w-sm md:max-w-md w-full drop-shadow-[0_20px_40px_rgba(0,0,0,0.5)]" />
            </div>
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-2">
              <a href="https://wa.me/5521972803625?text=Ol%C3%A1%20quero%20saber%20mais%20informa%C3%A7%C3%B5es." target="_blank" rel="noopener noreferrer">
                <Button size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2 rounded-full px-8 h-14 text-base font-bold shadow-[0_0_30px_hsl(36,100%,50%,0.3)]">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  Falar no WhatsApp
                </Button>
              </a>
              <a href="#planos">
                <Button size="lg" variant="outline" className="border-[hsl(222,30%,25%)] text-[hsl(210,40%,98%)] hover:bg-[hsl(222,30%,14%)] gap-2 rounded-full px-8 h-14 text-base bg-transparent">
                  Ver Planos
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </a>
            </div>
          </div>
          {/* Moto */}
        </div>
      </section>

      {/* 4 Feature Cards */}
      <section className="relative z-10 bg-[hsl(222,47%,6%)]">
        <div className="container mx-auto px-4 py-16">
          <div className="text-center mb-10">
            <p className="text-accent font-semibold text-sm uppercase tracking-widest mb-3">Na 021 você tem mais do que uma moto</p>
            <h2 className="text-3xl md:text-4xl font-bold font-display">
              Somos parceiros no seu trabalho
            </h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            {[
              { icon: Bike, title: 'Motos Sempre\nProntas', desc: 'Frota revisada e pronta pra rodar' },
              { icon: Wrench, title: 'Manutenção\nJá Incluída', desc: '50% da manutenção por nossa conta' },
              { icon: Shield, title: 'Seguro e\nProteção Total', desc: 'IPVA e seguro por nossa conta' },
              { icon: Headphones, title: 'Suporte\n100% Dedicado', desc: 'Atendimento rápido via WhatsApp' },
            ].map((f) => (
              <div
                key={f.title}
                className="group relative rounded-2xl border border-[hsl(222,30%,16%)] bg-gradient-to-b from-[hsl(222,47%,11%)] to-[hsl(222,47%,8%)] p-6 text-center hover:border-accent/30 transition-all duration-300 hover:shadow-[0_0_30px_hsl(36,100%,50%,0.08)]"
              >
                <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                  <f.icon className="h-7 w-7 text-accent" />
                </div>
                <h3 className="font-bold font-display text-sm md:text-base whitespace-pre-line leading-tight mb-2">{f.title}</h3>
                <p className="text-xs text-[hsl(220,9%,55%)]">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Seção Empresa - Features detalhadas */}
      <section className="bg-[hsl(222,47%,9%)] border-y border-[hsl(222,30%,14%)]">
        <div className="container mx-auto px-4 py-16 md:py-24">
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[
              {
                icon: Shield,
                title: 'Segurança Total',
                items: ['Seguro completo incluso no plano', 'IPVA sempre em dia', 'Documentação regularizada'],
              },
              {
                icon: Wrench,
                title: 'Manutenção Inclusa',
                items: ['50% da manutenção por nossa conta', 'Troca de óleo e revisões', 'Suporte técnico rápido'],
              },
              {
                icon: Clock,
                title: 'Sem Burocracia',
                items: ['Aprovação rápida e sem consulta', 'Contrato digital simples', 'Pagamento semanal acessível'],
              },
            ].map((s) => (
              <div key={s.title} className="rounded-2xl border border-[hsl(222,30%,16%)] bg-[hsl(222,47%,7%)] p-6 space-y-5">
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                  <s.icon className="h-6 w-6 text-accent" />
                </div>
                <h3 className="text-xl font-bold font-display">{s.title}</h3>
                <ul className="space-y-3">
                  {s.items.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm text-[hsl(220,9%,55%)]">
                      <ArrowRight className="h-4 w-4 text-accent shrink-0 mt-0.5" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Planos */}
      <section id="planos" className="bg-[hsl(222,47%,6%)]">
        <div className="container mx-auto px-4 py-16 md:py-24">
          <div className="text-center mb-4">
            <p className="text-accent font-semibold text-sm uppercase tracking-widest mb-3">Modelo disponível</p>
            <h2 className="text-3xl md:text-4xl font-bold font-display">Todos os planos</h2>
            <h2 className="text-3xl md:text-4xl font-bold font-display text-accent">para atender você</h2>
          </div>
          <p className="text-center text-[hsl(220,9%,55%)] mb-12 max-w-xl mx-auto">
            Escolha o plano ideal e comece a rodar. No final do contrato, a moto é sua!
          </p>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[
              { meses: 36, semanal: 450, diaria: '64,28', caucao: '500,00', popular: false },
              { meses: 30, semanal: 500, diaria: '71,42', caucao: '500,00', popular: true },
              { meses: 24, semanal: 550, diaria: '78,57', caucao: '500,00', popular: false },
            ].map((p) => (
              <div
                key={p.meses}
                className={`relative rounded-2xl overflow-hidden ${
                  p.popular
                    ? 'bg-accent text-accent-foreground shadow-[0_0_40px_hsl(36,100%,50%,0.25)]'
                    : 'bg-[hsl(222,47%,9%)] border border-[hsl(222,30%,18%)]'
                }`}
              >
                {p.popular && (
                  <div className="bg-accent-foreground/20 text-center py-2 text-xs font-bold uppercase tracking-wider">
                    Mais escolhido
                  </div>
                )}
                <div className="p-8 text-center space-y-5">
                  <div className={`mx-auto w-12 h-12 rounded-xl flex items-center justify-center ${p.popular ? 'bg-accent-foreground/20' : 'bg-accent/10'}`}>
                    <Calendar className={`h-6 w-6 ${p.popular ? 'text-accent-foreground' : 'text-accent'}`} />
                  </div>
                  <h3 className="text-xl font-bold font-display">{p.meses} meses</h3>

                  <div>
                    <p className={`text-xs uppercase tracking-wider mb-1 ${p.popular ? 'text-accent-foreground/70' : 'text-[hsl(220,9%,55%)]'}`}>
                      Diária a partir de
                    </p>
                    <p className="text-2xl font-bold">R$ {p.diaria}</p>
                  </div>

                  <div className={`h-px ${p.popular ? 'bg-accent-foreground/20' : 'bg-[hsl(222,30%,18%)]'}`} />

                  <div>
                    <p className="text-4xl font-bold font-display">R$ {p.semanal}</p>
                    <p className={`text-sm mt-1 ${p.popular ? 'text-accent-foreground/70' : 'text-[hsl(220,9%,55%)]'}`}>por semana</p>
                  </div>

                  <p className={`text-xs ${p.popular ? 'text-accent-foreground/60' : 'text-[hsl(220,9%,45%)]'}`}>
                    Valor do caução de <span className="font-bold">R$ {p.caucao}</span>
                  </p>

                  <a href={`https://wa.me/5521972803625?text=${encodeURIComponent(`Tenho interesse no plano de ${p.meses} meses, diária de R$ ${p.diaria}.`)}`} target="_blank" rel="noopener noreferrer" className="block">
                    <Button
                      className={`w-full rounded-xl h-12 font-bold ${
                        p.popular
                          ? 'bg-accent-foreground text-accent hover:bg-accent-foreground/90'
                          : 'bg-accent text-accent-foreground hover:bg-accent/90'
                      }`}
                    >
                      Quero esse plano
                    </Button>
                  </a>
                </div>
              </div>
            ))}
          </div>

          {/* Retirada + Documentos */}
          <div className="max-w-3xl mx-auto mt-12 grid sm:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-[hsl(222,30%,18%)] bg-[hsl(222,47%,9%)] p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                  <CreditCard className="h-5 w-5 text-accent" />
                </div>
                <h3 className="font-bold font-display text-lg">Para retirada</h3>
              </div>
              <ul className="space-y-2 text-sm text-[hsl(220,9%,55%)]">
                <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-accent shrink-0" /> Caução R$ 500 + 1ª semana antecipada</li>
                <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-accent shrink-0" /> Cartão em até 3x sem juros</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-[hsl(222,30%,18%)] bg-[hsl(222,47%,9%)] p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-accent" />
                </div>
                <h3 className="font-bold font-display text-lg">Documentos</h3>
              </div>
              <ul className="space-y-2 text-sm text-[hsl(220,9%,55%)]">
                <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-accent shrink-0" /> CNH categoria A (digital)</li>
                <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-accent shrink-0" /> Comprovante de residência</li>
                <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-accent shrink-0" /> 2 contatos de referência</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Benefícios */}
      <section id="beneficios" className="bg-[hsl(222,47%,9%)] border-y border-[hsl(222,30%,14%)]">
        <div className="container mx-auto px-4 py-16 md:py-24">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold font-display">
              Por que escolher a <span className="text-accent">021</span>?
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {[
              'Aprovação rápida',
              'Sem consulta SPC/Serasa',
              'Sem burocracia',
              'IPVA e seguro inclusos',
              '50% da manutenção inclusa',
              'Pagamento semanal acessível',
              'Contrato digital',
              'Suporte via WhatsApp',
              'No final, a moto é sua!',
            ].map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-xl border border-[hsl(222,30%,16%)] bg-[hsl(222,47%,7%)] p-4 hover:border-accent/30 transition-colors">
                <CheckCircle className="h-5 w-5 text-accent shrink-0" />
                <span className="text-sm font-medium">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="bg-[hsl(222,47%,6%)]">
        <div className="container mx-auto px-4 py-16 md:py-24">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-3xl md:text-4xl font-bold font-display">
                Perguntas Frequentes<br />
                <span className="text-accent">sobre a 021</span>
              </h2>
            </div>
            {faqs.map((faq, i) => (
              <FaqItem key={faq.q} q={faq.q} a={faq.a} />
            ))}
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="bg-[hsl(222,47%,9%)] border-y border-[hsl(222,30%,14%)]">
        <div className="container mx-auto px-4 py-16 md:py-24 text-center">
          <div className="max-w-lg mx-auto space-y-6">
            <h2 className="text-3xl md:text-4xl font-bold font-display">
              Dê o primeiro passo<br />
              <span className="text-accent">hoje mesmo</span>
            </h2>
            <p className="text-[hsl(220,9%,55%)] leading-relaxed">
              Rodar de moto nunca foi tão simples. A 021 Loca Motos oferece segurança e vantagens exclusivas para você trabalhar sem dor de cabeça.
            </p>
            <a href="https://wa.me/5521972803625?text=Ol%C3%A1%20quero%20saber%20mais%20informa%C3%A7%C3%B5es." target="_blank" rel="noopener noreferrer">
              <Button size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2 rounded-full px-10 h-14 text-base font-bold shadow-[0_0_30px_hsl(36,100%,50%,0.3)] mt-4">
                <WhatsAppIcon className="h-5 w-5" />
                Falar no WhatsApp
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[hsl(222,47%,4%)] py-10">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-accent p-1.5">
                <Bike className="h-4 w-4 text-accent-foreground" />
              </div>
              <span className="font-bold font-display">021 Loca Motos</span>
            </div>
            <div className="flex flex-wrap justify-center gap-3 text-xs text-muted-foreground">
              <Link to="/termos-de-uso" className="hover:text-accent underline-offset-2 hover:underline transition-colors">Termos de Uso</Link>
              <span>·</span>
              <Link to="/politica-de-privacidade" className="hover:text-accent underline-offset-2 hover:underline transition-colors">Política de Privacidade</Link>
            </div>
            <p className="text-xs text-[hsl(220,9%,40%)]">
              © {new Date().getFullYear()} 021 Loca Motos. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPreview;
