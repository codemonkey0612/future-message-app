import React, { useState } from 'react';
import { SurveySettings } from '../../types';

interface SurveyModalProps {
  survey: SurveySettings;
  onClose: () => void;
  onSubmit: (answers: any) => void;
}

const SurveyModal: React.FC<SurveyModalProps> = ({ survey, onClose, onSubmit }) => {
  const [answers, setAnswers] = useState<any>({});
  const [errors, setErrors] = useState<any>({});

  const handleAnswerChange = (questionId: string, value: any) => {
    setAnswers({ ...answers, [questionId]: value });
  };
  
  const validateSurvey = () => {
    const newErrors: any = {};
    survey.questions.forEach(q => {
        if(q.required && !answers[q.id]) {
            newErrors[q.id] = "この項目は必須です。"
        }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  const handleSubmit = () => {
    if(validateSurvey()){
        onSubmit(answers);
        onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">アンケート</h2>
          <p className="text-gray-600 mb-6">メッセージを保存する前に、いくつかの質問にお答えください。</p>
          <div className="space-y-6">
            {survey.questions.map(q => (
              <div key={q.id}>
                <label className="block text-sm font-medium text-gray-700">{q.text} {q.required && '*'}</label>
                {q.type === 'text' && (
                  <input type="text" onChange={(e) => handleAnswerChange(q.id, e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary" />
                )}
                {q.type === 'textarea' && (
                  <textarea onChange={(e) => handleAnswerChange(q.id, e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary" rows={4} />
                )}
                {q.type === 'select' && (
                  <select onChange={(e) => handleAnswerChange(q.id, e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary">
                    <option value="">選択してください</option>
                    {q.options?.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                )}
                {q.type === 'radio' && q.options?.map(opt => (
                  <div key={opt} className="flex items-center mt-2">
                    <input type="radio" name={q.id} value={opt} onChange={(e) => handleAnswerChange(q.id, e.target.value)} className="focus:ring-primary h-4 w-4 text-primary border-gray-300" />
                    <label className="ml-3 block text-sm font-medium text-gray-700">{opt}</label>
                  </div>
                ))}
                {q.type === 'checkbox' && q.options?.map(opt => (
                    <div key={opt} className="flex items-center mt-2">
                         <input type="checkbox" id={`${q.id}-${opt}`} name={q.id} value={opt} onChange={(e) => {
                            const current = answers[q.id] || [];
                            const newAnswers = e.target.checked ? [...current, opt] : current.filter((v: string) => v !== opt);
                            handleAnswerChange(q.id, newAnswers);
                         }} className="focus:ring-primary h-4 w-4 text-primary border-gray-300 rounded" />
                         <label htmlFor={`${q.id}-${opt}`} className="ml-3 block text-sm font-medium text-gray-700">{opt}</label>
                    </div>
                ))}
                {errors[q.id] && <p className="text-red-500 text-sm mt-1">{errors[q.id]}</p>}
              </div>
            ))}
          </div>
        </div>
        <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
          <button type="button" onClick={handleSubmit} className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary text-base font-medium text-white hover:bg-primary-hover focus:outline-none sm:ml-3 sm:w-auto sm:text-sm">
            送信を完了する
          </button>
          <button type="button" onClick={onClose} className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none sm:mt-0 sm:w-auto sm:text-sm">
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
};

export default SurveyModal;