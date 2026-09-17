import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ArrowLeftRight, CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react';

// Define the shape of your clinical drug data
interface Drug {
  id: string;
  name: string;
  generic_name: string;
  manufacturer: string;
  drug_class: string;
  fda_approval_date: string;
  mechanism_of_action: string;
  efficacy_rate: number;
  adverse_effects: string[];
  contraindications: string[];
}

const DrugComparator = () => {
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [loading, setLoading] = useState(true);
  
  // State for the two drugs selected for comparison
  const [drugAId, setDrugAId] = useState<string>('');
  const [drugBId, setDrugBId] = useState<string>('');

  useEffect(() => {
    fetchDrugs();
  }, []);

  const fetchDrugs = async () => {
    try {
      setLoading(true);
      // Ensure you have a 'drugs' table in your Supabase schema
      const { data, error } = await supabase
        .from('drugs')
        .select('*')
        .order('name');

      if (error) throw error;
      
      if (data) {
        setDrugs(data);
        // Default selection if data exists
        if (data.length >= 2) {
          setDrugAId(data[0].id);
          setDrugBId(data[1].id);
        }
      }
    } catch (error) {
      console.error('Error fetching drugs:', error);
    } finally {
      setLoading(false);
    }
  };

  const drugA = drugs.find((d) => d.id === drugAId);
  const drugB = drugs.find((d) => d.id === drugBId);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <div className="flex items-center space-x-4 mb-8">
        <div className="p-3 bg-blue-100 rounded-lg">
          <ArrowLeftRight className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Drug Comparator</h1>
          <p className="text-gray-500">Perform side-by-side clinical efficacy and safety analysis</p>
        </div>
      </div>

      {/* Selection Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Select Asset A</label>
          <select 
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            value={drugAId}
            onChange={(e) => setDrugAId(e.target.value)}
          >
            <option value="">Select a drug...</option>
            {drugs.map(drug => (
              <option key={drug.id} value={drug.id}>{drug.name} ({drug.generic_name})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Select Asset B</label>
          <select 
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            value={drugBId}
            onChange={(e) => setDrugBId(e.target.value)}
          >
            <option value="">Select a drug...</option>
            {drugs.map(drug => (
              <option key={drug.id} value={drug.id}>{drug.name} ({drug.generic_name})</option>
            ))}
          </select>
        </div>
      </div>

      {/* Comparison Matrix */}
      {drugA && drugB && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="p-4 font-medium text-gray-500 w-1/4">Clinical Attribute</th>
                <th className="p-4 font-bold text-gray-900 w-3/8 text-lg">{drugA.name}</th>
                <th className="p-4 font-bold text-gray-900 w-3/8 text-lg border-l border-gray-200">{drugB.name}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              <tr>
                <td className="p-4 text-sm font-medium text-gray-500 bg-gray-50">Generic Name</td>
                <td className="p-4 text-sm text-gray-900">{drugA.generic_name}</td>
                <td className="p-4 text-sm text-gray-900 border-l border-gray-200">{drugB.generic_name}</td>
              </tr>
              <tr>
                <td className="p-4 text-sm font-medium text-gray-500 bg-gray-50">Drug Class</td>
                <td className="p-4 text-sm text-gray-900">{drugA.drug_class}</td>
                <td className="p-4 text-sm text-gray-900 border-l border-gray-200">{drugB.drug_class}</td>
              </tr>
              <tr>
                <td className="p-4 text-sm font-medium text-gray-500 bg-gray-50">Efficacy Rate</td>
                <td className="p-4">
                  <div className="flex items-center space-x-2">
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                      <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${drugA.efficacy_rate}%` }}></div>
                    </div>
                    <span className="text-sm font-medium text-gray-700">{drugA.efficacy_rate}%</span>
                  </div>
                </td>
                <td className="p-4 border-l border-gray-200">
                  <div className="flex items-center space-x-2">
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                      <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${drugB.efficacy_rate}%` }}></div>
                    </div>
                    <span className="text-sm font-medium text-gray-700">{drugB.efficacy_rate}%</span>
                  </div>
                </td>
              </tr>
              <tr>
                <td className="p-4 text-sm font-medium text-gray-500 bg-gray-50">Adverse Effects</td>
                <td className="p-4">
                  <ul className="space-y-1 text-sm text-gray-700">
                    {drugA.adverse_effects.map((effect, i) => (
                      <li key={i} className="flex items-start">
                        <AlertCircle className="w-4 h-4 text-amber-500 mr-2 mt-0.5 shrink-0" />
                        {effect}
                      </li>
                    ))}
                  </ul>
                </td>
                <td className="p-4 border-l border-gray-200">
                  <ul className="space-y-1 text-sm text-gray-700">
                    {drugB.adverse_effects.map((effect, i) => (
                      <li key={i} className="flex items-start">
                        <AlertCircle className="w-4 h-4 text-amber-500 mr-2 mt-0.5 shrink-0" />
                        {effect}
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default DrugComparator;
