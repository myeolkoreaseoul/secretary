'use client';

import { useEffect, useState } from 'react';
import CategoryBadge from '@/components/CategoryBadge';
import EmployeeBadge from '@/components/EmployeeBadge';

interface ReportData {
  date: string;
  summary: {
    thoughts: number;
    conversations: number;
  };
  by_category: {
    category: string;
    color: string;
    count: number;
  }[];
  by_employee: {
    employee: string;
    role: string;
    count: number;
  }[];
}

export default function ReportPage() {
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReport = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/report?date=${date}`);
        const data = await response.json();
        setReport(data);
      } catch (error) {
        console.error('Error fetching report:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [date]);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">일일 리포트</h1>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
        />
      </div>

      {loading && (
        <p className="text-center text-gray-500">로딩 중...</p>
      )}

      {!loading && report && (
        <div className="space-y-6">
          {/* 요약 카드 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-6 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-center">
              <p className="text-4xl font-bold text-blue-600">{report.summary.thoughts}</p>
              <p className="text-gray-500">생각</p>
            </div>
            <div className="p-6 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-center">
              <p className="text-4xl font-bold text-purple-600">{report.summary.conversations}</p>
              <p className="text-gray-500">대화</p>
            </div>
          </div>

          {/* 카테고리별 */}
          {report.by_category.length > 0 && (
            <div className="p-6 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900">
              <h2 className="text-lg font-semibold mb-4">카테고리별</h2>
              <div className="space-y-2">
                {report.by_category.map((item) => (
                  <div key={item.category} className="flex items-center justify-between">
                    <CategoryBadge name={item.category} color={item.color} />
                    <span className="font-medium">{item.count}건</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 직원별 */}
          {report.by_employee.length > 0 && (
            <div className="p-6 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900">
              <h2 className="text-lg font-semibold mb-4">직원별 대화</h2>
              <div className="space-y-2">
                {report.by_employee.map((item) => (
                  <div key={item.employee} className="flex items-center justify-between">
                    <EmployeeBadge name={item.employee} role={item.role} />
                    <span className="font-medium">{item.count}건</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 데이터 없음 */}
          {report.summary.thoughts === 0 && report.summary.conversations === 0 && (
            <p className="text-center text-gray-500 py-8">
              {date}에 기록된 데이터가 없습니다.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
