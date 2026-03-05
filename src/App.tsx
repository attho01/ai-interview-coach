/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Building2, 
  FileText, 
  Search, 
  ChevronRight, 
  CheckCircle2, 
  Loader2, 
  Sparkles, 
  ArrowLeft,
  MessageSquare,
  History,
  User,
  Quote,
  Target,
  Lightbulb,
  Upload,
  X,
  FileIcon,
  ImageIcon,
  Star,
  Filter,
  AlertCircle,
  Brain,
  Zap,
  Lock,
  ExternalLink,
  Globe,
  List
} from "lucide-react";
import { 
  fetchInterviewQuestions, 
  generateInterviewAnswers, 
  validateApiKey,
  Question,
  QuestionCategory, 
  AnswerVersion, 
  Analysis 
} from "./services/gemini";
import { Part } from "@google/genai";

type Step = "LANDING" | "COMPANY" | "RESUME" | "QUESTIONS" | "ANSWER" | "PRIVACY" | "TERMS";

interface UploadedFile {
  name: string;
  type: string;
  data: string; // base64
  size: number;
}

export default function App() {
  const [step, setStep] = useState<Step>("LANDING");
  const [apiKey, setApiKey] = useState("");
  const [apiKeyError, setApiKeyError] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [company, setCompany] = useState("");
  const [jobInfo, setJobInfo] = useState("");
  
  // Personal Data
  const [resumeText, setResumeText] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [loading, setLoading] = useState(false);
  const [questionData, setQuestionData] = useState<{ source: string; date: string; categories: QuestionCategory[] } | null>(null);
  const [history, setHistory] = useState<Array<{ company: string; job: string; data: any }>>(() => {
    const saved = localStorage.getItem("interview_history");
    return saved ? JSON.parse(saved) : [];
  });
  const [favorites, setFavorites] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [selectedCompanyFilter, setSelectedCompanyFilter] = useState<string>("all");
  const [selectedJobFilter, setSelectedJobFilter] = useState<string>("all");
  
  const [selectedQuestion, setSelectedQuestion] = useState("");
  const [customQuestion, setCustomQuestion] = useState("");
  
  const [answerData, setAnswerData] = useState<{ analysis: Analysis; versions: AnswerVersion[]; tips: any } | null>(null);

  // Persistence
  useEffect(() => {
    const saved = localStorage.getItem("interview_favorites");
    if (saved) setFavorites(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem("interview_history", JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    localStorage.setItem("interview_favorites", JSON.stringify(favorites));
  }, [favorites]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(",")[1];
        setUploadedFiles(prev => [...prev, {
          name: file.name,
          type: file.type,
          data: base64String,
          size: file.size
        }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleFetchQuestions = async () => {
    if (!company) return;
    setLoading(true);
    try {
      const data = await fetchInterviewQuestions(company, jobInfo, apiKey);
      setQuestionData(data);
      setHistory(prev => {
        const exists = prev.find(h => h.company === company && h.job === jobInfo);
        if (exists) return prev;
        return [...prev, { company, job: jobInfo, data }];
      });
      setStep("QUESTIONS");
    } catch (error) {
      console.error("Error fetching questions:", error);
      alert("기출문제를 가져오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const toggleFavorite = (e: React.MouseEvent, question: string) => {
    e.stopPropagation();
    setFavorites(prev => 
      prev.includes(question) 
        ? prev.filter(q => q !== question) 
        : [...prev, question]
    );
  };

  const filteredCategories = useMemo(() => {
    const query = searchQuery.toLowerCase();
    
    // If showing favorites only, we might want to see them from all history
    if (showFavoritesOnly && selectedCompanyFilter === "all") {
      const allFavorites: Question[] = [];
      // Collect all questions from history that are in favorites
      history.forEach(h => {
        h.data.categories.forEach((cat: any) => {
          cat.questions.forEach((q: any) => {
            if (favorites.includes(q.question) && !allFavorites.find(af => af.question === q.question)) {
              allFavorites.push(q);
            }
          });
        });
      });
      
      if (allFavorites.length === 0) return [];
      
      return [{
        category: "즐겨찾기한 질문",
        questions: allFavorites.filter(q => q.question.toLowerCase().includes(query))
      }];
    }

    if (!questionData) return [];
    
    return questionData.categories.map(cat => ({
      ...cat,
      questions: cat.questions.filter(q => {
        const matchesSearch = q.question.toLowerCase().includes(query) || 
                             q.type?.toLowerCase().includes(query);
        const matchesFavorite = !showFavoritesOnly || favorites.includes(q.question);
        return matchesSearch && matchesFavorite;
      })
    })).filter(cat => cat.questions.length > 0);
  }, [questionData, searchQuery, showFavoritesOnly, favorites, history, selectedCompanyFilter]);

  const handleGenerateAnswer = async (question: string) => {
    if (loading) return;
    const q = question || customQuestion;
    if (!q) return;
    setSelectedQuestion(q);
    setLoading(true);
    
    try {
      // Prepare parts for Gemini
      const parts: Part[] = [];
      
      // Add text data if exists
      if (resumeText.trim()) {
        parts.push({ text: `추가 텍스트 정보: ${resumeText}` });
      }
      
      // Add files
      uploadedFiles.forEach(file => {
        parts.push({
          inlineData: {
            mimeType: file.type,
            data: file.data
          }
        });
      });

      const data = await generateInterviewAnswers(company, q, parts, apiKey);
      setAnswerData(data);
      setStep("ANSWER");
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      console.error("Error generating answer:", error);
      alert("답변을 생성하는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setStep("LANDING");
    setCompany("");
    setJobInfo("");
    setResumeText("");
    setUploadedFiles([]);
    setQuestionData(null);
    setSelectedQuestion("");
    setCustomQuestion("");
    setAnswerData(null);
    setApiKeyError("");
  };

  const handleStart = async () => {
    const trimmedKey = apiKey.trim();
    if (!trimmedKey) {
      setApiKeyError("API Key를 입력해주세요.");
      return;
    }

    setIsValidating(true);
    setApiKeyError("");
    
    try {
      const result = await validateApiKey(trimmedKey);
      
      if (result.valid) {
        // Validation succeeded - proceed to the next step
        setStep("COMPANY");
      } else {
        // Validation failed - show the specific error message
        setApiKeyError(result.error || "유효하지 않은 API Key입니다.");
      }
    } catch (error) {
      console.error("Critical validation error:", error);
      setApiKeyError("검증 프로세스 중 예외가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg text-brand-ink font-sans selection:bg-brand-secondary vibe-grid-bg">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-black/[0.03] px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2 cursor-pointer group" onClick={reset}>
            <div className="w-8 h-8 bg-brand-primary rounded-lg flex items-center justify-center group-hover:bg-brand-accent transition-colors duration-300">
              <Sparkles className="text-white w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <span className="font-black text-xl tracking-tighter text-brand-primary leading-none">AI 코치</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <nav className={`hidden lg:flex items-center gap-6 text-sm font-bold text-brand-muted ${["PRIVACY", "TERMS"].includes(step) ? "invisible" : ""}`}>
              <span className={step === "COMPANY" ? "text-brand-primary" : ""}>01 기업 정보</span>
              <div className="w-1 h-1 bg-black/10 rounded-full" />
              <span className={step === "RESUME" ? "text-brand-primary" : ""}>02 개인 데이터</span>
              <div className="w-1 h-1 bg-black/10 rounded-full" />
              <span className={step === "QUESTIONS" ? "text-brand-primary" : ""}>03 기출 질문</span>
              <div className="w-1 h-1 bg-black/10 rounded-full" />
              <span className={step === "ANSWER" ? "text-brand-primary" : ""}>04 면접 전략</span>
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        <AnimatePresence mode="wait">
          {step === "LANDING" && (
            <motion.div
              key="landing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="min-h-[80vh] flex flex-col items-center justify-center py-12"
            >
              <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                {/* Left Panel: Main Content & Input */}
                <div className="lg:col-span-7 bg-white rounded-[48px] p-12 lg:p-16 shadow-2xl border border-black/[0.03] flex flex-col justify-between space-y-12">
                  <div className="space-y-8">
                    <div className="flex flex-wrap gap-2">
                      <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-[#0F172A] text-white rounded-full text-[10px] font-black tracking-widest uppercase">
                        <Sparkles className="w-3 h-3" />
                        AI Interview Coach
                      </div>
                      <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-brand-secondary text-brand-primary rounded-full text-[10px] font-black tracking-widest uppercase border border-brand-primary/10">
                        Model: Gemini 3 Flash Preview
                      </div>
                    </div>
                    
                    <div className="space-y-6">
                      <h1 className="text-5xl lg:text-6xl font-black tracking-tighter leading-[1.1] text-[#0F172A]">
                        당신의 합격은<br />
                        <span className="text-[#4F46E5]">면접 준비에서</span><br />
                        결정됩니다.
                      </h1>
                      <p className="text-lg text-brand-muted leading-relaxed font-medium max-w-md">
                        이력서 분석부터 맞춤형 질문 생성까지.<br />
                        AI 정밀 진단으로 당신의 완벽한 면접을 설계하세요.
                      </p>
                    </div>

                    <div className="space-y-4 max-w-md">
                      <div className="relative group">
                        <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
                          <Lock className="w-5 h-5 text-brand-muted group-focus-within:text-brand-primary transition-colors" />
                        </div>
                        <input 
                          type="password"
                          value={apiKey}
                          onChange={(e) => {
                            setApiKey(e.target.value);
                            setApiKeyError("");
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !isValidating) {
                              handleStart();
                            }
                          }}
                          placeholder="Gemini API Key를 입력하세요"
                          className={`w-full bg-[#F8FAFC] border rounded-2xl pl-14 pr-6 py-5 text-sm focus:outline-none focus:ring-2 transition-all font-medium ${
                            apiKeyError ? "border-red-500 focus:ring-red-500/20" : "border-black/[0.05] focus:ring-brand-primary/20"
                          }`}
                        />
                      </div>
                      {apiKeyError && (
                        <p className="text-red-500 text-xs font-bold px-2 animate-bounce">
                          {apiKeyError}
                        </p>
                      )}
                      <button 
                        onClick={handleStart}
                        disabled={isValidating}
                        className={`w-full py-5 rounded-2xl font-black text-lg flex items-center justify-center gap-2 transition-all shadow-lg group ${
                          isValidating 
                            ? "bg-slate-300 cursor-not-allowed" 
                            : "bg-[#94A3B8] hover:bg-[#64748B] text-white shadow-slate-200"
                        }`}
                      >
                        {isValidating ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            키 검증 중...
                          </>
                        ) : (
                          <>
                            커리어 엔진 가동
                            <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 pt-8 border-t border-black/[0.03]">
                    <div className="flex -space-x-3">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="w-10 h-10 rounded-full border-2 border-white overflow-hidden bg-slate-100">
                          <img src={`https://i.pravatar.cc/100?u=${i}`} alt="user" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-brand-muted font-bold leading-tight">
                      5,000+ 취준생이 선택한<br />
                      프리미엄 면접 리포트
                    </p>
                  </div>
                </div>

                {/* Right Panel: Guide & Global Support */}
                <div className="lg:col-span-5 flex flex-col gap-6">
                  {/* API Guide Card */}
                  <div className="flex-1 bg-[#0F172A] rounded-[48px] p-10 lg:p-12 text-white flex flex-col justify-between shadow-2xl">
                    <div className="space-y-10">
                      <div className="flex items-center gap-3">
                        <List className="w-6 h-6 text-brand-secondary" />
                        <h2 className="text-2xl font-black tracking-tight">API 키 발급 안내</h2>
                      </div>

                      <div className="space-y-8">
                        {[
                          { step: 1, title: "Google AI Studio 접속", desc: "구글 계정으로 로그인 후 API 발급 페이지로 이동합니다.", link: "https://aistudio.google.com/app/apikey" },
                          { step: 2, title: "API 키 생성 (무료)", desc: "'API 키 만들기' 버튼을 눌러 새로운 키를 생성하세요." },
                          { step: 3, title: "키 복사 및 입력", desc: "발급된 키를 복사하여 왼쪽 입력창에 붙여넣고 엔진을 가동합니다." }
                        ].map((item) => (
                          <div key={item.step} className="flex gap-6 items-start group">
                            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center font-black text-sm shrink-0 group-hover:bg-brand-primary transition-colors">
                              {item.step}
                            </div>
                            <div className="space-y-1">
                              <h4 className="font-black text-lg flex items-center gap-2">
                                {item.title}
                                {item.link && <a href={item.link} target="_blank" rel="noreferrer"><ExternalLink className="w-4 h-4 opacity-50 hover:opacity-100 transition-opacity" /></a>}
                              </h4>
                              <p className="text-sm text-white/60 font-medium leading-relaxed">{item.desc}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-12 bg-white/5 rounded-3xl p-6 border border-white/10">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-6 h-6 bg-orange-500/20 rounded-full flex items-center justify-center">
                          <AlertCircle className="w-4 h-4 text-orange-500" />
                        </div>
                        <span className="text-[10px] font-black tracking-widest uppercase text-orange-500">Security Note</span>
                      </div>
                      <p className="text-[11px] text-white/50 leading-relaxed font-medium">
                        입력하신 API 키는 브라우저 세션 중에만 사용되며 별도로 저장되지 않습니다. 안심하고 분석을 진행하셔도 좋습니다.
                      </p>
                    </div>
                  </div>

                  {/* Global Support Card */}
                  <div className="bg-white rounded-[32px] p-8 shadow-xl border border-black/[0.03] flex items-center justify-between group cursor-pointer hover:border-brand-primary/20 transition-all">
                    <div className="flex items-center gap-5">
                      <div className="w-14 h-14 bg-brand-secondary rounded-2xl flex items-center justify-center group-hover:bg-brand-primary transition-colors duration-300">
                        <Globe className="w-7 h-7 text-brand-primary group-hover:text-white transition-colors" />
                      </div>
                      <div>
                        <h3 className="font-black text-lg text-brand-ink">Global Career Support</h3>
                        <p className="text-xs text-brand-muted font-bold">전 세계 어디서든 정밀 분석 가능</p>
                      </div>
                    </div>
                    <ChevronRight className="w-6 h-6 text-brand-muted group-hover:text-brand-primary group-hover:translate-x-1 transition-all" />
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {step === "COMPANY" && (
            <motion.div
              key="company"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-3xl mx-auto space-y-12"
            >
              <div className="space-y-4">
                <h2 className="text-4xl md:text-5xl font-black tracking-tight leading-tight">목표기업 정보입력</h2>
                <p className="text-lg text-brand-muted font-medium">어느 기업에 지원하시나요? 최신 기출문제를 찾아드립니다.</p>
              </div>

              <div className="vibe-card p-8 md:p-12 space-y-8">
                <div className="space-y-4">
                  <label className="vibe-label flex items-center gap-2">
                    <Building2 className="w-4 h-4" /> 기업명
                  </label>
                  <input 
                    type="text" 
                    placeholder="예: 삼성전자, 구글, 현대자동차"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    className="w-full px-6 py-4 bg-brand-bg border border-black/[0.03] rounded-2xl focus:ring-2 focus:ring-brand-primary outline-none transition-all text-lg font-bold tracking-tight text-brand-ink"
                  />
                  <div className="flex flex-wrap gap-2 mt-4">
                    {["삼성전자", "현대자동차", "카카오", "네이버", "쿠팡"].map(ex => (
                      <button 
                        key={ex}
                        onClick={() => setCompany(ex)}
                        className="px-4 py-2 bg-brand-secondary text-brand-primary rounded-lg text-sm font-bold hover:bg-brand-primary hover:text-white transition-colors"
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="vibe-label flex items-center gap-2">
                    <FileText className="w-4 h-4" /> 직무 정보 (선택)
                  </label>
                  <textarea 
                    placeholder="지원 직무, 요구사항 또는 채용 공고 링크..."
                    value={jobInfo}
                    onChange={(e) => setJobInfo(e.target.value)}
                    className="w-full px-6 py-4 bg-brand-bg border border-black/[0.03] rounded-2xl focus:ring-2 focus:ring-brand-primary outline-none transition-all min-h-[160px] resize-none text-base font-medium leading-relaxed text-brand-ink"
                  />
                </div>

                <button 
                  onClick={() => setStep("RESUME")}
                  disabled={!company}
                  className="vibe-button-primary w-full py-5 rounded-2xl text-lg group flex items-center justify-center gap-2 font-bold"
                >
                  다음 단계로 <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </motion.div>
          )}

          {step === "RESUME" && (
            <motion.div
              key="resume"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-3xl mx-auto space-y-12"
            >
              <div className="flex items-center gap-6 mb-2">
                <button onClick={() => setStep("COMPANY")} className="p-3 hover:bg-black/5 rounded-2xl transition-colors">
                  <ArrowLeft className="w-6 h-6" />
                </button>
                <div className="space-y-2">
                  <h2 className="text-4xl md:text-5xl font-black tracking-tight leading-tight">개인 데이터</h2>
                  <p className="text-lg text-brand-muted font-medium">심층 분석을 위해 이력서, 자소서 또는 포트폴리오를 업로드하세요.</p>
                </div>
              </div>

              <div className="vibe-card p-8 md:p-12 space-y-10">
                {/* File Upload Area */}
                <div className="space-y-6">
                  <label className="vibe-label flex items-center gap-2">
                    <Upload className="w-4 h-4" /> 첨부 파일 (PDF, TXT, 이미지)
                  </label>
                  
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="vibe-card border-2 border-dashed border-black/10 p-12 flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-brand-primary hover:bg-brand-secondary/30 transition-all group"
                  >
                    <div className="w-14 h-14 bg-brand-secondary rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-500">
                      <Upload className="text-brand-primary w-6 h-6" />
                    </div>
                    <div className="text-center space-y-2">
                      <p className="text-xl font-bold tracking-tight">클릭하여 파일 업로드</p>
                      <p className="vibe-label text-sm">이력서, 자소서, 경력기술서, 포트폴리오 (PDF, TXT, JPG, PNG)</p>
                    </div>
                    <input 
                      type="file" 
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      multiple
                      accept=".pdf,.txt,image/*"
                      className="hidden"
                    />
                  </div>

                  {/* File List */}
                  <AnimatePresence>
                    {uploadedFiles.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8">
                        {uploadedFiles.map((file, idx) => (
                          <motion.div 
                            key={idx}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="flex items-center justify-between p-4 bg-brand-bg rounded-xl border border-black/[0.03] group"
                          >
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
                                {file.type.includes('image') ? (
                                  <ImageIcon className="w-5 h-5 text-brand-primary" />
                                ) : file.type.includes('text') ? (
                                  <FileText className="w-5 h-5 text-brand-primary" />
                                ) : (
                                  <FileIcon className="w-5 h-5 text-brand-primary" />
                                )}
                              </div>
                              <div className="flex flex-col">
                                <span className="text-sm font-bold truncate max-w-[120px]">{file.name}</span>
                                <span className="vibe-label text-[10px]">{(file.size / 1024).toFixed(1)} KB</span>
                              </div>
                            </div>
                            <button 
                              onClick={() => removeFile(idx)}
                              className="p-2 hover:bg-red-50 text-black/10 hover:text-red-500 rounded-xl transition-all"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="space-y-6 pt-10 border-t border-black/[0.03]">
                  <label className="vibe-label flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" /> 추가 정보 입력 (선택)
                  </label>
                  <textarea 
                    placeholder="파일에 포함되지 않은 구체적인 성과나 경험이 있다면 입력해주세요..."
                    value={resumeText}
                    onChange={(e) => setResumeText(e.target.value)}
                    className="w-full px-6 py-4 bg-brand-bg border border-black/[0.03] rounded-2xl focus:ring-2 focus:ring-brand-primary outline-none transition-all min-h-[160px] resize-none text-base font-medium leading-relaxed text-brand-ink"
                  />
                </div>

                <button 
                  onClick={handleFetchQuestions}
                  disabled={uploadedFiles.length === 0 && !resumeText}
                  className="vibe-button-primary w-full py-5 rounded-2xl text-lg flex items-center justify-center gap-2 font-bold"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      기출문제 수집 중...
                    </>
                  ) : (
                    <>
                      <Search className="w-5 h-5" />
                      기출문제 찾기
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}

          {step === "QUESTIONS" && questionData && (
            <motion.div
              key="questions"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-12"
            >
              <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-8">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-brand-primary vibe-label text-sm font-bold">
                    <History className="w-4 h-4" /> 실시간 수집 완료
                  </div>
                  <h2 className="text-4xl md:text-5xl font-black tracking-tight leading-tight">{company}</h2>
                  <p className="vibe-label text-sm font-medium">출처: {questionData.source} | 업데이트: {questionData.date}</p>
                </div>
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => setStep("RESUME")}
                    className="vibe-label hover:text-brand-ink transition-colors"
                  >
                    데이터 수정
                  </button>
                </div>
              </div>

              {/* Search and Filters */}
              <div className="flex flex-col md:flex-row gap-6 bg-white p-6 rounded-[24px] border border-black/[0.03] shadow-sm">
                <div className="relative flex-1">
                  <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-muted" />
                  <input 
                    type="text"
                    placeholder="질문 검색..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-12 pr-6 py-4 bg-brand-bg border border-black/[0.03] rounded-2xl focus:ring-2 focus:ring-brand-primary outline-none text-base font-medium transition-all"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button 
                    onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                    className={`flex items-center gap-2 px-6 py-4 rounded-xl text-sm font-black transition-all border ${
                      showFavoritesOnly 
                        ? "bg-brand-primary text-white border-brand-primary" 
                        : "bg-white text-brand-muted border-black/[0.05] hover:border-brand-primary"
                    }`}
                  >
                    <Star className={`w-4 h-4 ${showFavoritesOnly ? "fill-white" : ""}`} />
                    중요 질문
                  </button>
                  
                  <div className="relative">
                    <select 
                      value={selectedCompanyFilter}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedCompanyFilter(val);
                        setSelectedJobFilter("all");
                        if (val !== "all") {
                          const hist = history.find(h => h.company === val);
                          if (hist) {
                            setQuestionData(hist.data);
                            setCompany(hist.company);
                            setJobInfo(hist.job);
                          }
                        }
                      }}
                      className="appearance-none pl-12 pr-10 py-4 bg-white border border-black/[0.05] rounded-xl text-sm font-black focus:ring-2 focus:ring-brand-primary outline-none transition-all cursor-pointer"
                    >
                      <option value="all">모든 기업</option>
                      {Array.from(new Set(history.map(h => h.company))).map((comp, i) => (
                        <option key={i} value={comp as string}>{(comp as string).toUpperCase()}</option>
                      ))}
                    </select>
                    <Building2 className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted pointer-events-none" />
                  </div>

                  <div className="relative">
                    <select 
                      value={selectedJobFilter}
                      disabled={selectedCompanyFilter === "all"}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedJobFilter(val);
                        if (val !== "all") {
                          const hist = history.find(h => h.company === selectedCompanyFilter && h.job === val);
                          if (hist) {
                            setQuestionData(hist.data);
                            setJobInfo(hist.job);
                          }
                        }
                      }}
                      className="appearance-none pl-12 pr-10 py-4 bg-white border border-black/[0.05] rounded-xl text-sm font-black focus:ring-2 focus:ring-brand-primary outline-none transition-all cursor-pointer disabled:opacity-50"
                    >
                      <option value="all">모든 직무</option>
                      {history
                        .filter(h => h.company === selectedCompanyFilter)
                        .map((h, i) => (
                          <option key={i} value={h.job}>{h.job?.toUpperCase() || "N/A"}</option>
                        ))}
                    </select>
                    <Filter className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted pointer-events-none" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {filteredCategories.length > 0 ? (
                  filteredCategories.map((cat, idx) => (
                    <div key={idx} className="vibe-card p-10 space-y-8">
                      <div className="flex items-center gap-4">
                        <div className="w-4 h-4 bg-brand-primary rounded-full shadow-lg shadow-brand-primary/20" />
                        <h3 className="font-black text-3xl tracking-tight">{(cat.category as string).toUpperCase()}</h3>
                      </div>
                      <div className="space-y-3">
                        {cat.questions.map((q) => (
                          <button
                            key={q.id}
                            onClick={() => handleGenerateAnswer(q.question)}
                            disabled={loading}
                            className={`w-full text-left p-6 rounded-xl transition-all group flex justify-between items-start gap-6 border ${
                              selectedQuestion === q.question && loading 
                                ? "bg-brand-secondary border-brand-primary ring-2 ring-brand-primary/10" 
                                : "bg-brand-bg border-transparent hover:border-brand-primary/20"
                            } disabled:opacity-70 disabled:cursor-not-allowed relative`}
                          >
                            <div className="flex-1 pr-10">
                              <p className="text-xl font-bold leading-tight tracking-tight">{q.question}</p>
                            </div>
                            <div className="flex flex-col items-end gap-4 shrink-0 mt-1">
                              <button
                                onClick={(e) => toggleFavorite(e, q.question)}
                                className={`p-2 rounded-xl transition-all ${
                                  favorites.includes(q.question) 
                                    ? "text-yellow-500 bg-yellow-50" 
                                    : "text-black/10 hover:text-yellow-500 hover:bg-yellow-50"
                                }`}
                              >
                                <Star className={`w-5 h-5 ${favorites.includes(q.question) ? "fill-yellow-500" : ""}`} />
                              </button>
                              {selectedQuestion === q.question && loading ? (
                                <Loader2 className="w-5 h-5 text-brand-accent animate-spin" />
                              ) : (
                                <ChevronRight className="w-5 h-5 text-black/10 group-hover:text-brand-accent transition-colors" />
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="md:col-span-2 py-32 text-center vibe-card">
                    <div className="w-20 h-20 bg-brand-secondary rounded-[24px] flex items-center justify-center mx-auto mb-6">
                      <Search className="w-10 h-10 text-brand-primary" />
                    </div>
                    <p className="vibe-label text-lg">조건에 맞는 질문이 없습니다.</p>
                  </div>
                )}

                <div className="bg-brand-primary p-12 rounded-[32px] text-white space-y-10 md:col-span-2 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 blur-[80px] rounded-full" />
                  <div className="space-y-4 relative z-10">
                    <h3 className="text-5xl font-black tracking-tighter">직접 질문 입력</h3>
                    <p className="text-white/60 text-xl font-semibold">준비하고 싶은 특정 질문이 있다면 아래에 입력하세요.</p>
                  </div>
                  <div className="flex flex-col md:flex-row gap-6 relative z-10">
                    <input 
                      type="text" 
                      placeholder="면접 질문을 입력하세요..."
                      value={customQuestion}
                      onChange={(e) => setCustomQuestion(e.target.value)}
                      className="flex-1 bg-white/10 border border-white/20 rounded-[12px] px-8 py-6 outline-none focus:ring-2 focus:ring-white transition-all text-2xl font-bold tracking-tight placeholder:text-white/40"
                    />
                    <button 
                      onClick={() => handleGenerateAnswer(customQuestion)}
                      disabled={!customQuestion || loading}
                      className="bg-white text-brand-primary px-12 py-6 rounded-[12px] font-black text-xl hover:bg-brand-secondary transition-all shadow-xl disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Sparkles className="w-6 h-6" />}
                      답변 생성
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {step === "ANSWER" && answerData && (
            <motion.div
              key="answer"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-16 pb-32"
            >
              {/* Analysis Section */}
              <div className="vibe-card p-12 md:p-16 space-y-12">
                <div className="flex justify-between items-start gap-8">
                  <div className="space-y-6 max-w-3xl">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-brand-secondary text-brand-primary rounded-full vibe-label">
                      <Target className="w-4 h-4" /> 전략적 분석
                    </div>
                    <h2 className="text-6xl font-black tracking-tighter leading-tight">
                      "{answerData.analysis.question}"
                    </h2>
                    <div className="flex flex-wrap gap-3">
                      {(answerData.analysis.competencies as string[]).map((comp, i) => (
                        <span key={i} className="px-4 py-1.5 bg-brand-bg rounded-xl vibe-label text-brand-muted border border-black/[0.03]">#{comp.toUpperCase()}</span>
                      ))}
                    </div>
                  </div>
                  <button 
                    onClick={() => setStep("QUESTIONS")}
                    className="p-4 hover:bg-brand-secondary rounded-xl transition-colors shrink-0"
                  >
                    <ArrowLeft className="w-8 h-8 text-brand-primary" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-12 pt-12 border-t border-black/[0.03]">
                  <div className="space-y-6">
                    <h4 className="vibe-label text-sm">기업 핵심가치 연계</h4>
                    <p className="text-xl leading-relaxed text-brand-ink font-semibold">{answerData.analysis.coreValueLink}</p>
                  </div>
                  <div className="space-y-6">
                    <h4 className="vibe-label text-sm">최적 소재 선정</h4>
                    <div className="p-10 bg-brand-secondary/30 rounded-[24px] border border-brand-primary/10 space-y-4">
                      <p className="text-2xl font-black tracking-tight text-brand-primary">{answerData.analysis.bestMaterial}</p>
                      <p className="text-base text-brand-muted leading-relaxed font-semibold">{answerData.analysis.matchingReason}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Answer Versions */}
              <div className="space-y-12">
                <div className="flex items-center gap-8">
                  <h3 className="text-5xl font-black tracking-tighter">전략적 답변 버전</h3>
                  <div className="h-px flex-1 bg-black/5"></div>
                </div>

                <div className="grid grid-cols-1 gap-12">
                  {answerData.versions.map((version, idx) => (
                    <motion.div 
                      key={idx}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className="vibe-card group"
                    >
                      <div className="p-12 md:p-16 space-y-12">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
                          <div className="space-y-3">
                            <h4 className="text-5xl font-black tracking-tighter">{version.title.toUpperCase()}</h4>
                            <p className="text-black/40 text-xl font-semibold">{version.description}</p>
                          </div>
                          <div className="flex gap-3">
                            {["S", "T", "A", "R"].map(letter => (
                              <div key={letter} className="w-12 h-12 rounded-xl border border-black/[0.05] flex items-center justify-center font-black text-sm text-brand-muted">
                                {letter}
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                          {Object.entries(version.star || {}).map(([key, value]) => (
                            <div key={key} className="space-y-3">
                              <div className="vibe-label text-brand-primary">
                                {key === 's' ? '상황 (Situation)' : key === 't' ? '과제 (Task)' : key === 'a' ? '행동 (Action)' : '결과 (Result)'}
                              </div>
                              <p className="text-xs leading-relaxed text-brand-muted font-medium">{value}</p>
                            </div>
                          ))}
                        </div>

                        <div className="bg-brand-bg p-10 rounded-[24px] relative border border-black/[0.03]">
                          <Quote className="absolute -top-6 -left-6 w-16 h-16 text-brand-primary/10" />
                          <p className="text-2xl leading-relaxed font-bold text-brand-ink italic tracking-tight">
                            "{version.fullText}"
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Tips Section */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="vibe-card p-12 space-y-10">
                  <h4 className="text-2xl font-black flex items-center gap-3 text-brand-primary">
                    <CheckCircle2 className="w-8 h-8" /> 답변 가이드라인
                  </h4>
                  <div className="space-y-10">
                    <div className="space-y-6">
                      <p className="vibe-label text-sm">권장 사항 (DO)</p>
                      <ul className="space-y-4">
                        {(answerData.tips.dos || []).map((item: string, i: number) => (
                          <li key={i} className="text-base font-bold flex items-start gap-4">
                            <span className="text-brand-primary mt-1 shrink-0">✓</span> {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="space-y-6">
                      <p className="vibe-label text-red-500">주의 사항 (DON'T)</p>
                      <ul className="space-y-4">
                        {(answerData.tips.donts || []).map((item: string, i: number) => (
                          <li key={i} className="text-base font-bold flex items-start gap-4">
                            <span className="text-red-500 mt-1 shrink-0">✕</span> {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="vibe-card p-12 space-y-10">
                  <h4 className="text-2xl font-black flex items-center gap-3 text-indigo-600">
                    <MessageSquare className="w-8 h-8" /> 예상 꼬리 질문
                  </h4>
                  <div className="space-y-8">
                    {(answerData.tips.followUp || []).map((item: any, i: number) => (
                      <div key={i} className="space-y-4 p-6 bg-brand-bg border border-black/[0.03] rounded-[24px]">
                        <p className="text-lg font-black leading-tight">Q. {item.question}</p>
                        <p className="text-sm text-brand-muted leading-relaxed font-semibold">A. {item.guide}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-brand-primary p-12 rounded-[48px] text-white space-y-10 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 blur-[80px] rounded-full" />
                  <h4 className="text-2xl font-black flex items-center gap-3 text-brand-secondary relative z-10">
                    <Lightbulb className="w-8 h-8" /> 평가 포인트
                  </h4>
                  <div className="space-y-10 relative z-10">
                    <div className="space-y-3">
                      <p className="vibe-label text-white/30 text-sm">답변의 강점</p>
                      <p className="text-base leading-relaxed font-semibold">{answerData.tips.evalPoints?.strength}</p>
                    </div>
                    <div className="space-y-3">
                      <p className="vibe-label text-white/30 text-sm">추가 어필 포인트</p>
                      <p className="text-base leading-relaxed font-semibold">{answerData.tips.evalPoints?.extra}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setStep("QUESTIONS")}
                    className="w-full py-5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-[16px] text-sm font-black transition-all relative z-10 active:scale-95"
                  >
                    다른 질문 준비하기
                  </button>
                </div>
              </div>
            </motion.div>
          )}
          {step === "PRIVACY" && (
            <motion.div
              key="privacy"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-4xl mx-auto space-y-12 py-12"
            >
              <button onClick={() => setStep("LANDING")} className="flex items-center gap-2 text-brand-muted hover:text-brand-primary transition-colors font-bold">
                <ArrowLeft className="w-4 h-4" /> 돌아가기
              </button>
              <div className="space-y-8">
                <h1 className="text-5xl font-black tracking-tighter">개인정보처리방침</h1>
                <div className="vibe-card p-12 space-y-8 text-brand-ink leading-relaxed">
                  <section className="space-y-4">
                    <h2 className="text-2xl font-black">1. 수집하는 개인정보 항목</h2>
                    <p>AI 코치는 서비스 제공을 위해 다음과 같은 정보를 수집합니다.</p>
                    <ul className="list-disc pl-6 space-y-2">
                      <li>이력서 및 자기소개서 데이터 (사용자 업로드)</li>
                      <li>지원 기업 및 직무 정보</li>
                      <li>서비스 이용 기록 및 로그 데이터</li>
                    </ul>
                  </section>
                  <section className="space-y-4">
                    <h2 className="text-2xl font-black">2. 개인정보의 이용 목적</h2>
                    <p>수집된 정보는 다음과 같은 목적으로 사용됩니다.</p>
                    <ul className="list-disc pl-6 space-y-2">
                      <li>AI 기반 맞춤형 면접 질문 및 답변 생성</li>
                      <li>사용자 경험 개선 및 서비스 최적화</li>
                      <li>고객 문의 응대 및 기술 지원</li>
                    </ul>
                  </section>
                  <section className="space-y-4">
                    <h2 className="text-2xl font-black">3. 개인정보의 보유 및 파기</h2>
                    <p>회사는 원칙적으로 개인정보 수집 및 이용 목적이 달성된 후에는 해당 정보를 지체 없이 파기합니다. 단, 관계 법령에 따라 보존할 필요가 있는 경우 일정 기간 보관할 수 있습니다.</p>
                  </section>
                  <section className="space-y-4">
                    <h2 className="text-2xl font-black">4. 정보주체의 권리</h2>
                    <p>사용자는 언제든지 자신의 개인정보를 조회하거나 수정을 요청할 수 있으며, 서비스 탈퇴를 통해 개인정보 수집 및 이용에 대한 동의를 철회할 수 있습니다.</p>
                  </section>
                </div>
              </div>
            </motion.div>
          )}

          {step === "TERMS" && (
            <motion.div
              key="terms"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-4xl mx-auto space-y-12 py-12"
            >
              <button onClick={() => setStep("LANDING")} className="flex items-center gap-2 text-brand-muted hover:text-brand-primary transition-colors font-bold">
                <ArrowLeft className="w-4 h-4" /> 돌아가기
              </button>
              <div className="space-y-8">
                <h1 className="text-5xl font-black tracking-tighter">이용약관</h1>
                <div className="vibe-card p-12 space-y-8 text-brand-ink leading-relaxed">
                  <section className="space-y-4">
                    <h2 className="text-2xl font-black">1. 목적</h2>
                    <p>본 약관은 AI 코치(이하 "회사")가 제공하는 서비스의 이용 조건 및 절차, 회사와 회원 간의 권리, 의무 및 책임 사항을 규정함을 목적으로 합니다.</p>
                  </section>
                  <section className="space-y-4">
                    <h2 className="text-2xl font-black">2. 서비스의 제공 및 변경</h2>
                    <p>회사는 AI 기반 면접 준비 지원 서비스를 제공하며, 기술적 사양의 변경이나 운영상의 사유로 서비스 내용을 변경할 수 있습니다.</p>
                  </section>
                  <section className="space-y-4">
                    <h2 className="text-2xl font-black">3. 이용자의 의무</h2>
                    <p>이용자는 본 약관 및 관계 법령을 준수해야 하며, 타인의 정보를 도용하거나 서비스 운영을 방해하는 행위를 해서는 안 됩니다.</p>
                  </section>
                  <section className="space-y-4">
                    <h2 className="text-2xl font-black">4. 책임의 제한</h2>
                    <p>회사는 천재지변, 서비스 점검 등 불가항력적인 사유로 인한 서비스 중단에 대해 책임을 지지 않습니다. 또한, AI가 생성한 답변의 정확성이나 합격 여부를 보장하지 않습니다.</p>
                  </section>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Loading Overlay */}
      {loading && step !== "QUESTIONS" && step !== "ANSWER" && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[100] bg-brand-bg/80 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center"
        >
          <div className="relative">
            <div className="w-24 h-24 border-4 border-brand-primary/10 rounded-[32px] animate-[spin_3s_linear_infinite]" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-12 h-12 bg-brand-primary rounded-2xl animate-pulse" />
            </div>
          </div>
          <div className="mt-12 space-y-6">
            <h3 className="text-5xl font-black tracking-tighter leading-none">데이터 분석 중</h3>
            <p className="vibe-label text-sm">Gemini 3.1 Pro 엔진을 통해 처리 중입니다</p>
          </div>
        </motion.div>
      )}

      {/* Footer */}
      <footer className="py-20 border-t border-black/[0.03] relative z-10 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <p className="vibe-label text-xs">© 2026 ACLPro. All Rights Reserved.</p>
            <div className="flex gap-8">
              <button onClick={() => setStep("PRIVACY")} className="vibe-label text-xs hover:text-brand-primary transition-colors">개인정보처리방침</button>
              <button onClick={() => setStep("TERMS")} className="vibe-label text-xs hover:text-brand-primary transition-colors">이용약관</button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
