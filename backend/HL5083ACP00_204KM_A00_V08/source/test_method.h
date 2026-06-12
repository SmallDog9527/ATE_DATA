/*****************************************************************************
*                                                                            *
*       Source title:   Test_Method.h                                        *
*                       (Universal functions for all ACCO test projects)       *
*         Written by:                                                   *
*        Description:			                                             *
*                                                                            *
*   Revision History:                                                        *
*                                                                            *
*     mm/dd/yy  r.rr  - Original coding.                                     *
*                                                                            *
*****************************************************************************/

/*
 REVISION BLOCK:
 -Rev. -- Date --------------------------------------------------
 00   08/24/18  Initial.						
 01   09/04/18  Reset ERROR_RES to 9999		
 Remove fpvi current ramp 1ms capload at start for EOS damage risk
 ----------------------------------------------------------------
 */

#pragma once
#include "stdafx.h"

#define MAX_SAMPLES 2000
#define ERROR_RES	9999
#define START_DELAY	0

class Test_Method
{
public:
	Test_Method() {}
	~Test_Method() {}

	FOVI_VRNG get_fovi_v_range(double v)
	{
		if (v < 0)
			v = -v;
		if (v <= 1)
			return FOVI_1V;
		else if (v <= 5)
			return FOVI_5V;
		else if (v <= 10)
			return FOVI_10V;
		else if (v <= 20)
			return FOVI_20V;
		else if (v <= 50)
			return FOVI_50V;
		else
			return FOVI_5V;
	}

	FOVI_IRNG get_fovi_i_range(double i)
	{
		if (i < 0)
			i = -i;
		if (i <= 1e-6)
			return FOVI_1UA;
		else if (i <= 10e-6)
			return FOVI_10UA;
		else if (i <= 100e-6)
			return FOVI_100UA;
		else if (i <= 1e-3)
			return FOVI_1MA;
		else if (i <= 10e-3)
			return FOVI_10MA;
		else if (i <= 100e-3)
			return FOVI_100MA;
		else if (i <= 1)
			return FOVI_1A;
		else
			return FOVI_1MA;
	}

	// Use fovi, ramp one pin volatege, capture another pin voltage, trig stop
	// The ramp pin i_range fixed 1A, v_range auto changed by force value
	// Good for UVLO, threshold, power good measurement
	// fovi_cap no current loading
	BOOL ramp(FOVI fovi_ramp, FOVI fovi_cap, double start_point, double stop_point, double step, int interval, double trig_level, TRIG_MODE trig_mode, double *result)
	{
		if (interval < 10)	return FALSE;
		if (step == 0)	return FALSE;

		FOVI_VRNG v_range = FOVI_5V;
		FOVI_IRNG i_range = FOVI_1A;
		if (fabs(start_point) < fabs(stop_point))
			v_range = get_fovi_v_range(stop_point);
		else
			v_range = get_fovi_v_range(start_point);

		int samples;
		double pat[MAX_SAMPLES];
		samples = int(fabs((stop_point - start_point) / step));
		if ((samples <= 1) || (samples > MAX_SAMPLES)){
			samples = MAX_SAMPLES;
		}

		fovi_cap.Set(FI, 0, FOVI_10V, FOVI_10UA, RELAY_SENSE_ON);

		STSAWGCreateRampData(&pat[0], samples, 1, start_point, stop_point);
		fovi_ramp.AwgClear();
		fovi_ramp.AwgLoader("awg", FV, v_range, i_range, pat, samples);
		fovi_ramp.AwgSelect("awg", 0, samples - 1, samples - 1, interval);
		fovi_cap.SetMeasVTrig(trig_level, trig_mode);

		fovi_ramp.Set(FV, start_point, v_range, i_range, RELAY_ON);

		fovi_ramp.MeasureVI(samples, interval, MEAS_AWG);
		fovi_cap.MeasureVI(samples, interval, MEAS_AWG);

		STSEnableAWG(&fovi_ramp, &fovi_cap);
		STSEnableMeas(&fovi_ramp, &fovi_cap);
		STSAWGRunTriggerStop(&fovi_cap, &fovi_ramp, &fovi_cap);

		int Trig_Point[SITE_NUM];
		SERIAL{
			Trig_Point[SITE] = (int)fovi_cap.GetMeasResult(SITE, TRIG_RESULT);
			if (((Trig_Point[SITE]) > 2) && ((Trig_Point[SITE]) < samples - 2)){
				//result[SITE] = start_point + (Trig_Point[SITE] - 1) * step;
				result[SITE] = fovi_ramp.GetMeasResult(SITE, MVRET, Trig_Point[SITE] - 1);
			}
			else {
				result[SITE] = ERROR_RES;
			}
		}

		return TRUE;
	}

	// Use fovi, ramp one pin volatege, capture another pin voltage, trig stop
	// Can set fovi_ramp v_range and i_range 
	// Good for UVLO, threshold, power good measurement
	// fovi_cap no current loading
//	test_method.ramp(FO_VSYS, FO_INTB, FOVI_10V, FOVI_100MA, 2.3, 2.7, 0.005, 100, 2.5, TRIG_FALLING, vsys_high);  //INTB H to L

	BOOL ramp(FOVI fovi_ramp, FOVI fovi_cap, FOVI_VRNG v_range, FOVI_IRNG i_range, double start_point, double stop_point, double step, int interval, double trig_level, TRIG_MODE trig_mode, double *result)
	{
		if (interval < 10)	return FALSE;
		if (step == 0)	return FALSE;

		int samples;
		double pat[MAX_SAMPLES];
		samples = int(fabs((stop_point - start_point) / step+1));
		if ((samples <= 1) || (samples > MAX_SAMPLES)){
			samples = MAX_SAMPLES;
		}

		//fovi_cap.Set(FI, 0, FOVI_10V, FOVI_10UA, RELAY_SENSE_ON);

		STSAWGCreateRampData(&pat[0], samples, 1, start_point, stop_point);
		fovi_ramp.AwgClear();
		fovi_ramp.AwgLoader("awg", FV, v_range, i_range, pat, samples);
		fovi_ramp.Set(FV, start_point, v_range, i_range, RELAY_ON, 0.5);
		delay_ms(1);

		fovi_ramp.AwgSelect("awg", 0, samples - 1, samples - 1, interval);
		fovi_cap.SetMeasVTrig(trig_level, trig_mode);
		fovi_ramp.MeasureVI(samples, interval, MEAS_AWG);
		fovi_cap.MeasureVI(samples, interval, MEAS_AWG);

//		STSEnableAWG(&fovi_ramp, &fovi_cap);
		STSEnableAWG(&fovi_ramp);
		STSEnableMeas(&fovi_ramp, &fovi_cap);
//		STSAWGRunTriggerStop(&fovi_cap, &fovi_ramp, &fovi_cap);
		STSAWGRun();

		int Trig_Point[SITE_NUM];
		SERIAL{
			Trig_Point[SITE] = (int)fovi_cap.GetMeasResult(SITE, TRIG_RESULT);
			if (((Trig_Point[SITE]) > 2) && ((Trig_Point[SITE]) < samples )){
				//result[SITE] = start_point + (Trig_Point[SITE] - 1) * step;
				result[SITE] = fovi_ramp.GetMeasResult(SITE, MVRET, Trig_Point[SITE] );
			}
			else {
				result[SITE] = stop_point;
			}
		}

		return TRUE;
	}

	// Use fovi, ramp one pin volatege, capture same pin current, trig stop
	// Can set fovi_ramp v_range and i_range 
	// Good for UVLO
	BOOL ramp(FOVI fovi_ramp, FOVI_VRNG v_range, FOVI_IRNG i_range, double start_point, double stop_point, double step, int interval, double trig_level, TRIG_MODE trig_mode, double *result)
	{
		if (interval < 10)	return FALSE;
		if (step == 0)	return FALSE;

		int samples;
		double pat[MAX_SAMPLES];
		samples = int(fabs((stop_point - start_point) / step));
		if ((samples <= 1) || (samples > MAX_SAMPLES)){
			samples = MAX_SAMPLES;
		}

		STSAWGCreateRampData(&pat[0], samples, 1, start_point, stop_point);
		fovi_ramp.AwgClear();
		fovi_ramp.AwgLoader("awg", FV, v_range, i_range, pat, samples);
		fovi_ramp.AwgSelect("awg", 0, samples - 1, samples - 1, interval);
		fovi_ramp.Set(FV, start_point, v_range, i_range, RELAY_ON, 1);
		if (!START_DELAY)
			delay_ms(START_DELAY);

		fovi_ramp.SetMeasITrig(trig_level, trig_mode);
		fovi_ramp.MeasureVI(samples, interval, MEAS_AWG);
		STSEnableAWG(&fovi_ramp);
		STSEnableMeas(&fovi_ramp);
		STSAWGRunTriggerStop(&fovi_ramp, &fovi_ramp);

		int Trig_Point[SITE_NUM];
		SERIAL{
			Trig_Point[SITE] = (int)fovi_ramp.GetMeasResult(SITE, MIRET, TRIG_RESULT);
			if (((Trig_Point[SITE]) > 2) && ((Trig_Point[SITE]) < samples - 2)){
				//result[SITE] = start_point + (Trig_Point[SITE] - 2) * step;
				result[SITE] = fovi_ramp.GetMeasResult(SITE, MVRET, Trig_Point[SITE] - 2);
			}
			else {
				result[SITE] = ERROR_RES;
			}
		}

		return TRUE;
	}


	// Use fovi, ramp one pin volatege, capture another pin voltage, trig stop
	// fovi_cap can set current loading
	// Good for UVLO, threshold, power good measurement
	BOOL ramp(FOVI fovi_ramp, FOVI fovi_cap, double i_load, double start_point, double stop_point, double step, int interval, double trig_level, TRIG_MODE trig_mode, double *result)
	{
		if (interval < 10)	return FALSE;
		if (step == 0)	return FALSE;

		FOVI_VRNG v_range = FOVI_5V;
		FOVI_IRNG i_range = FOVI_100MA;
		if (fabs(start_point) < fabs(stop_point))
			v_range = get_fovi_v_range(stop_point);
		else
			v_range = get_fovi_v_range(start_point);

		FOVI_IRNG iload_range = FOVI_100MA;
		if (i_load < 1)
			iload_range = get_fovi_i_range(i_load);
		else
			return FALSE;

		int samples;
		double pat[MAX_SAMPLES];
		samples = int(fabs((stop_point - start_point) / step + 1));
		if ((samples <= 1) || (samples > MAX_SAMPLES)){
			samples = MAX_SAMPLES;
		}

		fovi_cap.Set(FI, i_load, FOVI_10V, iload_range, RELAY_ON);

		STSAWGCreateRampData(&pat[0], samples, 1, start_point, stop_point);
		fovi_ramp.AwgClear();
		fovi_ramp.AwgLoader("awg", FV, v_range, i_range, pat, samples);
		fovi_ramp.AwgSelect("awg", 0, samples - 1, samples - 1, interval);
		fovi_cap.SetMeasVTrig(trig_level, trig_mode);

		fovi_ramp.Set(FV, start_point, v_range, i_range, RELAY_ON, 1);
		if (!START_DELAY)
			delay_ms(START_DELAY);

		fovi_ramp.MeasureVI(samples, interval, MEAS_AWG);
		fovi_cap.MeasureVI(samples, interval, MEAS_AWG);

		STSEnableAWG(&fovi_ramp, &fovi_cap);
		STSEnableMeas(&fovi_ramp, &fovi_cap);
		STSAWGRunTriggerStop(&fovi_cap, &fovi_ramp, &fovi_cap);

		int Trig_Point[SITE_NUM];
		SERIAL{
			Trig_Point[SITE] = (int)fovi_cap.GetMeasResult(SITE, TRIG_RESULT);
			if (((Trig_Point[SITE]) > 2) && ((Trig_Point[SITE]) < samples - 2)){
				//result[SITE] = start_point + (Trig_Point[SITE] - 1) * step;
				result[SITE] = fovi_ramp.GetMeasResult(SITE, MVRET, Trig_Point[SITE] - 1);
			}
			else {
				result[SITE] = ERROR_RES;
			}
		}

		return TRUE;
	}


	// Use fpvi, ramp one pin current, capture another pin voltage, trig stop
	// Good for current limit measurement
	BOOL ramp(FPVI10 fpvi_ramp, FOVI fovi_cap, FPVI10_VRNG v_range, FPVI10_IRNG i_range, VIMode vimode,string trig ,double start_point, double stop_point, double step, int interval, double trig_level, TRIG_MODE trig_mode, double *result)
	{
		if (interval < 10)	return FALSE;
		if (step == 0)	return FALSE;

		int samples;
		double pat[MAX_SAMPLES];
		samples = int(fabs((stop_point - start_point) / step + 1));
		if ((samples <= 1) || (samples > MAX_SAMPLES)){
			samples = MAX_SAMPLES;
		}

		//fovi_cap.Set(FI, 0, FOVI_10V, FOVI_10UA, RELAY_SENSE_ON);
		fpvi_ramp.AwgClear();
		STSAWGCreateRampData(&pat[0], samples, 1, start_point, stop_point);
		fpvi_ramp.AwgLoader("awg", vimode, v_range, i_range, pat, samples);
		fpvi_ramp.AwgSelect("awg", 0, samples - 1, samples - 1, interval);
		if (trig == "VTrig")
		{
			fovi_cap.SetMeasVTrig(trig_level, trig_mode);
		}
		else if (trig == "ITrig")
		{
			fovi_cap.SetMeasITrig(trig_level, trig_mode);
		}
		

		fpvi_ramp.Set(vimode, start_point, v_range, i_range, RELAY_ON);
		if (!START_DELAY)
			delay_ms(START_DELAY);

		fpvi_ramp.MeasureVI(samples, interval, MEAS_AWG);
		fovi_cap.MeasureVI(samples, interval, MEAS_AWG);

		STSEnableAWG(&fpvi_ramp);
		STSEnableMeas(&fovi_cap, &fpvi_ramp);
		STSAWGRunTriggerStop(&fovi_cap, &fovi_cap, &fpvi_ramp);

		int Trig_Point[SITE_NUM];
		SERIAL{
			Trig_Point[SITE] = (int)fovi_cap.GetMeasResult(SITE, TRIG_RESULT);
			if (((Trig_Point[SITE]) > 2) && ((Trig_Point[SITE]) < samples - 2)){
				result[SITE] = start_point + (Trig_Point[SITE] - 1) * step;
			}
			else
				result[SITE] = ERROR_RES;
		}

		fpvi_ramp.Set(FI, 0, v_range, i_range, RELAY_ON);
		fpvi_ramp.Set(FI, 0, v_range, i_range, RELAY_OFF);

		return TRUE;
	}

	

	// For debug only, to watch burn high voltage PIN I/V by AccoTest softview
	// The burn time is fixed to 20ms
	BOOL watch_burn(FOVI fovi_res, FOVI_VRNG v_range, FOVI_IRNG i_range, double burn_v, bool enable = false){
		if (!enable)	 return FALSE;

		int interval = 10; // us
		int samples;
		double pat[MAX_SAMPLES];
		samples = MAX_SAMPLES;

		for (int i = 0; i < samples; ++i) pat[i] = burn_v;
		fovi_res.AwgClear();
		fovi_res.AwgLoader("awg", FV, v_range, i_range, pat, samples);
		fovi_res.AwgSelect("awg", 0, samples - 1, samples - 1, interval);

		fovi_res.Set(FV, burn_v, v_range, i_range, RELAY_ON);
		fovi_res.MeasureVI(samples, interval, MEAS_AWG);

		STSEnableAWG(&fovi_res);
		STSEnableMeas(&fovi_res);
		STSAWGRun();

		fovi_res.Set(FV, 0, v_range, i_range, RELAY_ON);

		return TRUE;
	}

	int where_at(double* cap, int samples, TRIG_MODE trig_mode, double trig_level, bool reverse = false){
		int start = 0;
		int stop = 0;

		if (reverse){
			start = samples;
			stop = 0;
		}
		else {
			start = 0;
			stop = samples;
		}

		for (int i = start; i < stop; ++i){
			if ((trig_mode == TRIG_RISING) && (cap[i] > trig_level))
				return i - 1;
			if ((trig_mode == TRIG_FALLING) && (cap[i] < trig_level))
				return i - 1;
		}

		return -1;
	}

	// use for open short test classify to different bin
	// pgs must include "OS_SHORT" "OS_SOME_OPEN" "OS_ALL_OPEN" "OS_LEAK"
	BOOL OS_Classify(short funcindex, string pin_str_array[], unsigned int OS_NUM, string leak_str_array[], unsigned int LEAK_NUM, double os_result[][SITE_NUM], double leak_result[][SITE_NUM], vector<string>& vec_exclude)
	{
		if (OS_NUM == 0) return FALSE;
		int open_count[SITE_NUM] = { 0 };
		int SHORT_FLAG[SITE_NUM] = { 0 };
		int SOME_OPEN_FLAG[SITE_NUM] = { 0 };
		int ALL_OPEN_FLAG[SITE_NUM] = { 0 };
		int LEAK_FLAG[SITE_NUM] = { 0 };
		CParam *OS_Param;

		for (unsigned int os_count = 0; os_count < OS_NUM; ++os_count){
			if (find(vec_exclude.begin(), vec_exclude.end(), pin_str_array[os_count]) != vec_exclude.end()) continue;
			OS_Param = StsGetParam(funcindex, pin_str_array[os_count].c_str());
			double spec_l = OS_Param->GetMinLimit();
			double spec_h = OS_Param->GetMaxLimit();
			SERIAL{
				if (spec_l > 0){
					if (os_result[os_count][SITE] < spec_l)
						SHORT_FLAG[SITE] = 1;
					if (SHORT_FLAG[SITE] != 1 && (os_result[os_count][SITE] > spec_h))
						open_count[SITE]++;
				}
				if (spec_h < 0){
					if (os_result[os_count][SITE] >spec_h)
						SHORT_FLAG[SITE] = 1;
					if (SHORT_FLAG[SITE] != 1 && (os_result[os_count][SITE] < spec_l))
						open_count[SITE]++;
				}
			}
		}

		for (unsigned int leak_count = 0; leak_count < LEAK_NUM; ++leak_count){
			OS_Param = StsGetParam(funcindex, leak_str_array[leak_count].c_str());
			double spec_l = OS_Param->GetMinLimit();
			double spec_h = OS_Param->GetMaxLimit();
			SERIAL{
				if (leak_result[leak_count][SITE] < spec_l || leak_result[leak_count][SITE] > spec_h)
				LEAK_FLAG[SITE] = 1;
			}
		}

		SERIAL    //judge some open or all open 
		{
			if (SHORT_FLAG[SITE] != 1 && open_count[SITE] == (OS_NUM - vec_exclude.size()))
			ALL_OPEN_FLAG[SITE] = 1;
			else if (SHORT_FLAG[SITE] != 1 && open_count[SITE] < (int)(OS_NUM - vec_exclude.size()) && open_count[SITE] > 0)
				SOME_OPEN_FLAG[SITE] = 1;
		}

		SERIAL	StsGetParam(funcindex, "OS_SHORT")->SetTestResult(SITE, 0, SHORT_FLAG[SITE]);
		SERIAL	StsGetParam(funcindex, "OS_SOME_OPEN")->SetTestResult(SITE, 0, SOME_OPEN_FLAG[SITE]);
		SERIAL	StsGetParam(funcindex, "OS_ALL_OPEN")->SetTestResult(SITE, 0, ALL_OPEN_FLAG[SITE]);


		return TRUE;
	}

	//***********************************************ADD BY Bill*****************************************************************************
	//***********************************************no trig stop*****************************************************************************
	//**********************************************one pin ramp another pin capture*********************************************************
	// FPVI ramp FPVI capture
	//test_method.ramp(FPVI0, FPVI1, FI, FPVI10_2V, FPVI10_1A, 0, 1, 0.01, 100, nINT, "VTrig", "stop", 0, TRIG_FALLING, 2.5, true, results);
	BOOL ramp(FPVI10 vi_ramp, VIMode vimode, FPVI10_VRNG v_range, FPVI10_IRNG i_range, double start_point, double stop_point, double step, int interval, FPVI10 vi_cap, const char* str_trig, TRIG_MODE trig_mode, double trig_level, BOOL result_type, double *result)
	{
		string trig(str_trig);
		if (interval < 10)	return FALSE;
		if (step == 0)	return FALSE;
		int samples;
		double pat[MAX_SAMPLES];
		samples = int(fabs((stop_point - start_point) / step + 1));
		if ((samples <= 1) || (samples > MAX_SAMPLES)){
			samples = MAX_SAMPLES;
		}
		vi_ramp.Set(vimode, start_point, v_range, i_range, RELAY_ON,1);
		vi_ramp.AwgClear();
		STSAWGCreateRampData(&pat[0], samples, 1, start_point, stop_point);
		vi_ramp.AwgLoader("awg", vimode, v_range, i_range, pat, samples);
		vi_ramp.AwgSelect("awg", 0, samples - 1, samples - 1, interval);
		if (trig == "VTrig")
		{
			vi_cap.SetMeasVTrig(trig_level, trig_mode);
		}
		else if (trig == "ITrig")
		{
			vi_cap.SetMeasITrig(trig_level, trig_mode);
		}
		if (!START_DELAY)
			delay_ms(START_DELAY);
		vi_ramp.MeasureVI(samples, interval, MEAS_AWG);
		vi_cap.MeasureVI(samples, interval, MEAS_AWG);
		STSEnableAWG(&vi_ramp);
		STSEnableMeas(&vi_cap, &vi_ramp);
		STSAWGRun();
		int Trig_Point[SITE_NUM];
		SERIAL{
			Trig_Point[SITE] = (int)vi_cap.GetMeasResult(SITE, TRIG_RESULT);
			if (Trig_Point[SITE]==0)
			{
				Trig_Point[SITE]=1;
			}
			if (((Trig_Point[SITE]) <=samples )){
				if (!result_type)
				{
					if (start_point < stop_point)
					{
						result[SITE] = start_point + (Trig_Point[SITE] - 1) * step;
					}
					else
					{
						result[SITE] = start_point - (Trig_Point[SITE] - 1) * step;
					}
				}
				else
				{
					if(vimode==FI)
					{
						result[SITE] = vi_ramp.GetMeasResult(SITE, MIRET, Trig_Point[SITE] - 1);
					}
					else
					{
						result[SITE] = vi_ramp.GetMeasResult(SITE, MVRET, Trig_Point[SITE] - 1);
					}	
				}
			}
			else
				result[SITE] = ERROR_RES;
		}
		return TRUE;
	}
	// FPVI ramp FOVI capture

	//test_method.ramp(FO_VSYS, FO_INTB, FOVI_10V, FOVI_100MA, 2.3, 2.7, 0.005, 100, 2.5, TRIG_FALLING, vsys_high);  //INTB H to L

	BOOL ramp(FPVI10 vi_ramp, VIMode vimode, FPVI10_VRNG v_range, FPVI10_IRNG i_range, double start_point, double stop_point, double step, int interval, FOVI vi_cap, const char* str_trig, TRIG_MODE trig_mode, double trig_level, BOOL result_type, double *result)
	{
		string trig(str_trig);
		if (interval < 10)	return FALSE;
		if (step == 0)	return FALSE;
		int samples;
		double pat[MAX_SAMPLES];
		samples = int(fabs((stop_point - start_point) / step + 1));
		if ((samples <= 1) || (samples > MAX_SAMPLES)){
			samples = MAX_SAMPLES;
		}
		vi_ramp.Set(vimode, start_point, v_range, i_range, RELAY_ON, 1);
		vi_ramp.AwgClear();
		STSAWGCreateRampData(&pat[0], samples, 1, start_point, stop_point);
		vi_ramp.AwgLoader("awg", vimode, v_range, i_range, pat, samples);
		vi_ramp.AwgSelect("awg", 0, samples - 1, samples - 1, interval);
		if (trig == "VTrig")
		{
			vi_cap.SetMeasVTrig(trig_level, trig_mode);
		}
		else if (trig == "ITrig")
		{
			vi_cap.SetMeasITrig(trig_level, trig_mode);
		}
		if (!START_DELAY)
			delay_ms(START_DELAY);
		vi_ramp.MeasureVI(samples, interval, MEAS_AWG);
		vi_cap.MeasureVI(samples, interval, MEAS_AWG);
		STSEnableAWG(&vi_ramp);
		STSEnableMeas(&vi_cap, &vi_ramp);
		STSAWGRun();
		int Trig_Point[SITE_NUM];
		SERIAL{
			Trig_Point[SITE] = (int)vi_cap.GetMeasResult(SITE, TRIG_RESULT);
			if (Trig_Point[SITE]==0)
			{
				Trig_Point[SITE]=1;
			}
			if (((Trig_Point[SITE]) <=samples )){
				if (!result_type)
				{
					if (start_point < stop_point)
					{
						result[SITE] = start_point + (Trig_Point[SITE] - 1) * step;
					}
					else
					{
						result[SITE] = start_point - (Trig_Point[SITE] - 1) * step;
					}
				}
				else
				{
					if(vimode==FI)
					{
						result[SITE] = vi_ramp.GetMeasResult(SITE, MIRET, Trig_Point[SITE] - 1);
					}
					else
					{
						result[SITE] = vi_ramp.GetMeasResult(SITE, MVRET, Trig_Point[SITE] - 1);
					}	
				}
			}
			else
				result[SITE] = ERROR_RES;
		}
		return TRUE;
	}
	// FOVI ramp FOVI capture
	BOOL ramp(FOVI vi_ramp, VIMode vimode, FOVI_VRNG v_range, FOVI_IRNG i_range, double start_point, double stop_point, double step, int interval, FOVI vi_cap, const char* str_trig, TRIG_MODE trig_mode, double trig_level, BOOL result_type, double *result)
	{
		string trig(str_trig);
		if (interval < 10)	return FALSE;
		if (step == 0)	return FALSE;
		int samples;
		double pat[MAX_SAMPLES];
		samples = int(fabs((stop_point - start_point) / step + 1));
		if ((samples <= 1) || (samples > MAX_SAMPLES)){
			samples = MAX_SAMPLES;
		}
		vi_ramp.Set(vimode, start_point, v_range, i_range, RELAY_ON, 1);
		vi_ramp.AwgClear();
		STSAWGCreateRampData(&pat[0], samples, 1, start_point, stop_point);
		vi_ramp.AwgLoader("awg", vimode, v_range, i_range, pat, samples);
		vi_ramp.AwgSelect("awg", 0, samples - 1, samples - 1, interval);
		if (trig == "VTrig")
		{
			vi_cap.SetMeasVTrig(trig_level, trig_mode);
		}
		else if (trig == "ITrig")
		{
			vi_cap.SetMeasITrig(trig_level, trig_mode);
		}
		if (!START_DELAY)
			delay_ms(START_DELAY);
		vi_ramp.MeasureVI(samples, interval, MEAS_AWG);
		vi_cap.MeasureVI(samples, interval, MEAS_AWG);
		STSEnableAWG(&vi_ramp);
		STSEnableMeas(&vi_cap, &vi_ramp);
		STSAWGRun();
		int Trig_Point[SITE_NUM];
		SERIAL{
			Trig_Point[SITE] = (int)vi_cap.GetMeasResult(SITE, TRIG_RESULT);
			if (Trig_Point[SITE]==0)
			{
				Trig_Point[SITE]=1;
			}
			if (((Trig_Point[SITE]) <=samples )){
				if (!result_type)
				{
					if (start_point < stop_point)
					{
						result[SITE] = start_point + (Trig_Point[SITE] - 1) * step;
					}
					else
					{
						result[SITE] = start_point - (Trig_Point[SITE] - 1) * step;
					}
				}
				else
				{
					if(vimode==FI)
					{
						result[SITE] = vi_ramp.GetMeasResult(SITE, MIRET, Trig_Point[SITE] - 1);
					}
					else
					{
						result[SITE] = vi_ramp.GetMeasResult(SITE, MVRET, Trig_Point[SITE] - 1);
					}	
				}
			}
			else
				result[SITE] = ERROR_RES;
		}
		return TRUE;
	}
	// FOVI ramp FPVI capture
	BOOL ramp(FOVI vi_ramp, VIMode vimode, FOVI_VRNG v_range, FOVI_IRNG i_range, double start_point, double stop_point, double step, int interval, FPVI10 vi_cap, const char* str_trig, TRIG_MODE trig_mode, double trig_level, BOOL result_type, double *result)
	{
		string trig(str_trig);
		if (interval < 10)	return FALSE;
		if (step == 0)	return FALSE;
		int samples;
		double pat[MAX_SAMPLES];
		samples = int(fabs((stop_point - start_point) / step + 1));
		if ((samples <= 1) || (samples > MAX_SAMPLES)){
			samples = MAX_SAMPLES;
		}
		vi_ramp.Set(vimode, start_point, v_range, i_range, RELAY_ON, 1);
		vi_ramp.AwgClear();
		STSAWGCreateRampData(&pat[0], samples, 1, start_point, stop_point);
		vi_ramp.AwgLoader("awg", vimode, v_range, i_range, pat, samples);
		vi_ramp.AwgSelect("awg", 0, samples - 1, samples - 1, interval);
		if (trig == "VTrig")
		{
			vi_cap.SetMeasVTrig(trig_level, trig_mode);
		}
		else if (trig == "ITrig")
		{
			vi_cap.SetMeasITrig(trig_level, trig_mode);
		}
		if (!START_DELAY)
			delay_ms(START_DELAY);
		vi_ramp.MeasureVI(samples, interval, MEAS_AWG);
		vi_cap.MeasureVI(samples, interval, MEAS_AWG);
		STSEnableAWG(&vi_ramp);
		STSEnableMeas(&vi_cap, &vi_ramp);
		STSAWGRun();
		int Trig_Point[SITE_NUM];
		SERIAL{
			Trig_Point[SITE] = (int)vi_cap.GetMeasResult(SITE, TRIG_RESULT);
			if (Trig_Point[SITE]==0)
			{
				Trig_Point[SITE]=1;
			}
			if (((Trig_Point[SITE]) <=samples )){
				if (!result_type)
				{
					if (start_point < stop_point)
					{
						result[SITE] = start_point + (Trig_Point[SITE] - 1) * step;
					}
					else
					{
						result[SITE] = start_point - (Trig_Point[SITE] - 1) * step;
					}	
				}
				else
				{
					if(vimode==FI)
					{
						result[SITE] = vi_ramp.GetMeasResult(SITE, MIRET, Trig_Point[SITE] - 1);
					}
					else
					{
						result[SITE] = vi_ramp.GetMeasResult(SITE, MVRET, Trig_Point[SITE] - 1);
					}	
				}
			}
			else
				result[SITE] = ERROR_RES;
		}
		return TRUE;
	}
	//**********************************************one pin ramp same pin capture*********************************************************
	// FOVI ramp and capture 
	BOOL ramp(FOVI vi_ramp, VIMode vimode, FOVI_VRNG v_range, FOVI_IRNG i_range, double start_point, double stop_point, double step, int interval, const char* str_trig, TRIG_MODE trig_mode, double trig_level, BOOL result_type, double *result)
	{
		string trig(str_trig);
		if (interval < 10)	return FALSE;
		if (step == 0)	return FALSE;
		int samples;
		double pat[MAX_SAMPLES];
		samples = int(fabs((stop_point - start_point) / step));
		if ((samples <= 1) || (samples > MAX_SAMPLES)){
			samples = MAX_SAMPLES;
		}
		STSAWGCreateRampData(&pat[0], samples, 1, start_point, stop_point);
		vi_ramp.Set(vimode, start_point, v_range, i_range, RELAY_ON, 1);
		vi_ramp.AwgClear();
		vi_ramp.AwgLoader("awg", FV, v_range, i_range, pat, samples);
		vi_ramp.AwgSelect("awg", 0, samples - 1, samples - 1, interval);
		if (!START_DELAY)
			delay_ms(START_DELAY);
		if (trig == "VTrig")
		{
			vi_ramp.SetMeasVTrig(trig_level, trig_mode);
		}
		else if (trig == "ITrig")
		{
			vi_ramp.SetMeasITrig(trig_level, trig_mode);
		}
		vi_ramp.MeasureVI(samples, interval, MEAS_AWG);
		STSEnableAWG(&vi_ramp);
		STSEnableMeas(&vi_ramp);
		STSAWGRun();
		int Trig_Point[SITE_NUM];
		SERIAL{
			Trig_Point[SITE] = (int)vi_ramp.GetMeasResult(SITE, MIRET, TRIG_RESULT);
			if (Trig_Point[SITE]==0)
			{
				Trig_Point[SITE]=1;
			}
			if (((Trig_Point[SITE]) <=samples )){
				if (!result_type)
				{
					if (start_point < stop_point)
					{
						result[SITE] = start_point + (Trig_Point[SITE] - 1) * step;
					}
					else
					{
						result[SITE] = start_point - (Trig_Point[SITE] - 1) * step;
					}
				}
				else
				{
					if(vimode==FI)
					{
						result[SITE] = vi_ramp.GetMeasResult(SITE, MIRET, Trig_Point[SITE] - 1);
					}
					else
					{
						result[SITE] = vi_ramp.GetMeasResult(SITE, MVRET, Trig_Point[SITE] - 1);
					}	
				}
			}
			else {
				result[SITE] = ERROR_RES;
			}
		}
		return TRUE;
	}
	// FPVI ramp and capture 
	BOOL ramp(FPVI10 vi_ramp, VIMode vimode, FPVI10_VRNG v_range, FPVI10_IRNG i_range, double start_point, double stop_point, double step, int interval, const char* str_trig, TRIG_MODE trig_mode, double trig_level, BOOL result_type, double *result)
	{
		string trig(str_trig);
		if (interval < 10)	return FALSE;
		if (step == 0)	return FALSE;
		int samples;
		double pat[MAX_SAMPLES];
		samples = int(fabs((stop_point - start_point) / step));
		if ((samples <= 1) || (samples > MAX_SAMPLES)){
			samples = MAX_SAMPLES;
		}
		STSAWGCreateRampData(&pat[0], samples, 1, start_point, stop_point);
		vi_ramp.Set(vimode, start_point, v_range, i_range, RELAY_ON, 1);
		vi_ramp.AwgClear();
		vi_ramp.AwgLoader("awg", FV, v_range, i_range, pat, samples);
		vi_ramp.AwgSelect("awg", 0, samples - 1, samples - 1, interval);
		if (!START_DELAY)
			delay_ms(START_DELAY);
		if (trig == "VTrig")
		{
			vi_ramp.SetMeasVTrig(trig_level, trig_mode);
		}
		else if (trig == "ITrig")
		{
			vi_ramp.SetMeasITrig(trig_level, trig_mode);
		}
		vi_ramp.MeasureVI(samples, interval, MEAS_AWG);
		STSEnableAWG(&vi_ramp);
		STSEnableMeas(&vi_ramp);
		STSAWGRun();
		int Trig_Point[SITE_NUM];
		SERIAL{
			Trig_Point[SITE] = (int)vi_ramp.GetMeasResult(SITE, MIRET, TRIG_RESULT);
			if (Trig_Point[SITE]==0)
			{
				Trig_Point[SITE]=1;
			}
			if (((Trig_Point[SITE]) <=samples )){
				if (!result_type)
				{
					if (start_point < stop_point)
					{
						result[SITE] = start_point + (Trig_Point[SITE] - 1) * step;
					}
					else
					{
						result[SITE] = start_point - (Trig_Point[SITE] - 1) * step;
					}
				}
				else
				{
					if(vimode==FI)
					{
						result[SITE] = vi_ramp.GetMeasResult(SITE, MIRET, Trig_Point[SITE] - 1);
					}
					else
					{
						result[SITE] = vi_ramp.GetMeasResult(SITE, MVRET, Trig_Point[SITE] - 1);
					}	
				}
			}
			else {
				result[SITE] = ERROR_RES;
			}
		}
		return TRUE;
	}




	//***********************************************trig stop*****************************************************************************
	//**********************************************one pin ramp another pin capture*********************************************************
	// FPVI ramp FPVI capture
	BOOL ramp(FPVI10 vi_ramp, VIMode vimode, FPVI10_VRNG v_range, FPVI10_IRNG i_range, double start_point, double stop_point, double step, int interval, FPVI10 vi_cap, const char* str_trig, const char* str_trigstop,int stop_sample, TRIG_MODE trig_mode, double trig_level, BOOL result_type, double *result)
	{
		string trig(str_trig);
		string trigstop(str_trigstop);
		if (interval < 10)	return FALSE;
		if (step == 0)	return FALSE;
		int samples;
		double pat[MAX_SAMPLES];
		samples = int(fabs((stop_point - start_point) / step + 1));
		if ((samples <= 1) || (samples > MAX_SAMPLES)){
			samples = MAX_SAMPLES;
		}
		if (stop_sample)
		{
			stop_sample = samples-1;
		}
		vi_ramp.Set(vimode, start_point, v_range, i_range, RELAY_ON, 1);
		vi_ramp.AwgClear();
		STSAWGCreateRampData(&pat[0], samples, 1, start_point, stop_point);
		vi_ramp.AwgLoader("awg", vimode, v_range, i_range, pat, samples);
		vi_ramp.AwgSelect("awg", 0, samples - 1, stop_sample, interval);
		if (trig == "VTrig")
		{
			vi_cap.SetMeasVTrig(trig_level, trig_mode);
		}
		else if (trig == "ITrig")
		{
			vi_cap.SetMeasITrig(trig_level, trig_mode);
		}
		if (!START_DELAY)
			delay_ms(START_DELAY);
		vi_ramp.MeasureVI(samples, interval, MEAS_AWG);
		vi_cap.MeasureVI(samples, interval, MEAS_AWG);
		STSEnableAWG(&vi_ramp);
		STSEnableMeas(&vi_cap, &vi_ramp);
		STSAWGRunTriggerStop(&vi_cap, &vi_cap, &vi_ramp);
		int Trig_Point[SITE_NUM];
		SERIAL{
			Trig_Point[SITE] = (int)vi_cap.GetMeasResult(SITE, TRIG_RESULT);
			if (Trig_Point[SITE]==0)
			{
				Trig_Point[SITE]=1;
			}
			if (((Trig_Point[SITE]) <=samples )){
				if (!result_type)
				{
					if (start_point < stop_point)
					{
						result[SITE] = start_point + (Trig_Point[SITE] - 1) * step;
					}
					else
					{
						result[SITE] = start_point - (Trig_Point[SITE] - 1) * step;
					}
				}
				else
				{
					if(vimode==FI)
					{
						result[SITE] = vi_ramp.GetMeasResult(SITE, MIRET, Trig_Point[SITE] - 1);
					}
					else
					{
						result[SITE] = vi_ramp.GetMeasResult(SITE, MVRET, Trig_Point[SITE] - 1);
					}	
				}
			}
			else
				result[SITE] = ERROR_RES;
		}
		return TRUE;
	}
	// FPVI ramp FOVI capture
	BOOL ramp(FPVI10 vi_ramp, VIMode vimode, FPVI10_VRNG v_range, FPVI10_IRNG i_range, double start_point, double stop_point, double step, int interval, FOVI vi_cap, const char* str_trig, const char* str_trigstop, INT stop_sample,TRIG_MODE trig_mode, double trig_level, BOOL result_type, double *result)
	{
		string trig(str_trig);
		string trigstop(str_trigstop);
		if (interval < 10)	return FALSE;
		if (step == 0)	return FALSE;
		int samples;
		double pat[MAX_SAMPLES];
		samples = int(fabs((stop_point - start_point) / step + 1));
		if ((samples <= 1) || (samples > MAX_SAMPLES)){
			samples = MAX_SAMPLES;
		}
		if (stop_sample)
		{
			stop_sample = samples - 1;
		}
		vi_ramp.Set(vimode, start_point, v_range, i_range, RELAY_ON, 1);
		vi_ramp.AwgClear();
		STSAWGCreateRampData(&pat[0], samples, 1, start_point, stop_point);
		vi_ramp.AwgLoader("awg", vimode, v_range, i_range, pat, samples);
		vi_ramp.AwgSelect("awg", 0, samples - 1, stop_sample, interval);
		if (trig == "VTrig")
		{
			vi_cap.SetMeasVTrig(trig_level, trig_mode);
		}
		else if (trig == "ITrig")
		{
			vi_cap.SetMeasITrig(trig_level, trig_mode);
		}
		if (!START_DELAY)
			delay_ms(START_DELAY);
		vi_ramp.MeasureVI(samples, interval, MEAS_AWG);
		vi_cap.MeasureVI(samples, interval, MEAS_AWG);
		STSEnableAWG(&vi_ramp);
		STSEnableMeas(&vi_cap, &vi_ramp);
		STSAWGRunTriggerStop(&vi_cap, &vi_cap, &vi_ramp);
		int Trig_Point[SITE_NUM];
		SERIAL{
			Trig_Point[SITE] = (int)vi_cap.GetMeasResult(SITE, TRIG_RESULT);
			if (Trig_Point[SITE]==0)
			{
				Trig_Point[SITE]=1;
			}
			if (((Trig_Point[SITE]) <=samples )){
				if (!result_type)
				{
					if (start_point < stop_point)
					{
						result[SITE] = start_point + (Trig_Point[SITE] - 1) * step;
					}
					else
					{
						result[SITE] = start_point - (Trig_Point[SITE] - 1) * step;
					}
				}
				else
				{
					if(vimode==FI)
					{
						result[SITE] = vi_ramp.GetMeasResult(SITE, MIRET, Trig_Point[SITE] - 1);
					}
					else
					{
						result[SITE] = vi_ramp.GetMeasResult(SITE, MVRET, Trig_Point[SITE] - 1);
					}	
				}
			}
			else
				result[SITE] = ERROR_RES;
		}
		
		return TRUE;
	}
	// FOVI ramp FOVI capture
	BOOL ramp(FOVI vi_ramp, VIMode vimode, FOVI_VRNG v_range, FOVI_IRNG i_range, double start_point, double stop_point, double step, int interval, FOVI vi_cap, const char* str_trig, const char* str_trigstop, int stop_sample, TRIG_MODE trig_mode, double trig_level, BOOL result_type, double *result)
	{
		string trig(str_trig);
		string trigstop(str_trigstop);
		if (interval < 10)	return FALSE;
		if (step == 0)	return FALSE;
		int samples;
		double pat[MAX_SAMPLES];
		samples = int(fabs((stop_point - start_point) / step + 1));
		if ((samples <= 1) || (samples > MAX_SAMPLES)){
			samples = MAX_SAMPLES;
		}
		if (stop_sample)
		{
			stop_sample = samples - 1;
		}
		vi_ramp.Set(vimode, start_point, v_range, i_range, RELAY_ON,1);
		vi_ramp.AwgClear();
		STSAWGCreateRampData(&pat[0], samples, 1, start_point, stop_point);
		vi_ramp.AwgLoader("awg", vimode, v_range, i_range, pat, samples);
		vi_ramp.AwgSelect("awg", 0, samples - 1, stop_sample, interval);
		if (trig == "VTrig")
		{
			vi_cap.SetMeasVTrig(trig_level, trig_mode);
		}
		else if (trig == "ITrig")
		{
			vi_cap.SetMeasITrig(trig_level, trig_mode);
		}
		
		if (!START_DELAY)
			delay_ms(START_DELAY);
		vi_ramp.MeasureVI(samples, interval, MEAS_AWG);
		vi_cap.MeasureVI(samples, interval, MEAS_AWG);
		STSEnableAWG(&vi_ramp);
		STSEnableMeas(&vi_cap, &vi_ramp);
		STSAWGRunTriggerStop(&vi_cap, &vi_cap, &vi_ramp);
		int Trig_Point[SITE_NUM];
		SERIAL{
			Trig_Point[SITE] = (int)vi_cap.GetMeasResult(SITE, TRIG_RESULT);
			if (Trig_Point[SITE]==0)
			{
				Trig_Point[SITE]=1;
			}
			if (((Trig_Point[SITE]) <=samples )){
				if (!result_type)
				{
					if (start_point < stop_point)
					{
						result[SITE] = start_point + (Trig_Point[SITE] - 1) * step;
					}
					else
					{
						result[SITE] = start_point - (Trig_Point[SITE] - 1) * step;
					}
				}
				else
				{
					if(vimode==FI)
					{
						result[SITE] = vi_ramp.GetMeasResult(SITE, MIRET, Trig_Point[SITE] - 1);
					}
					else
					{
						result[SITE] = vi_ramp.GetMeasResult(SITE, MVRET, Trig_Point[SITE] - 1);
					}	
				}
			}
			else
				result[SITE] = ERROR_RES;
		}
		return TRUE;
	}
	// FOVI ramp FPVI capture
	BOOL ramp(FOVI vi_ramp, VIMode vimode, FOVI_VRNG v_range, FOVI_IRNG i_range, double start_point, double stop_point, double step, int interval, FPVI10 vi_cap, const char* str_trig, const char* str_trigstop, int stop_sample, TRIG_MODE trig_mode, double trig_level, BOOL result_type, double *result)
	{
		string trig(str_trig);
		string trigstop(str_trigstop);
		if (interval < 10)	return FALSE;
		if (step == 0)	return FALSE;
		int samples;
		double pat[MAX_SAMPLES];
		samples = int(fabs((stop_point - start_point) / step + 1));
		if ((samples <= 1) || (samples > MAX_SAMPLES)){
			samples = MAX_SAMPLES;
		}
		if (stop_sample)
		{
			stop_sample = samples - 1;
		}
		vi_ramp.Set(vimode, start_point, v_range, i_range, RELAY_ON, 1);
		vi_ramp.AwgClear();
		STSAWGCreateRampData(&pat[0], samples, 1, start_point, stop_point);
		vi_ramp.AwgLoader("awg", vimode, v_range, i_range, pat, samples);
		vi_ramp.AwgSelect("awg", 0, samples - 1, stop_sample, interval);
		if (trig == "VTrig")
		{
			vi_cap.SetMeasVTrig(trig_level, trig_mode);
		}
		else if (trig == "ITrig")
		{
			vi_cap.SetMeasITrig(trig_level, trig_mode);
		}
		if (!START_DELAY)
			delay_ms(START_DELAY);
		vi_ramp.MeasureVI(samples, interval, MEAS_AWG);
		vi_cap.MeasureVI(samples, interval, MEAS_AWG);
		STSEnableAWG(&vi_ramp);
		STSEnableMeas(&vi_cap, &vi_ramp);
		STSAWGRunTriggerStop(&vi_cap, &vi_cap, &vi_ramp);
		int Trig_Point[SITE_NUM];
		SERIAL{
			Trig_Point[SITE] = (int)vi_cap.GetMeasResult(SITE, TRIG_RESULT);
			if (Trig_Point[SITE]==0)
			{
				Trig_Point[SITE]=1;
			}
			if (((Trig_Point[SITE]) <=samples )){
				if (!result_type)
				{
					if (start_point < stop_point)
					{
						result[SITE] = start_point + (Trig_Point[SITE] - 1) * step;
					}
					else
					{
						result[SITE] = start_point - (Trig_Point[SITE] - 1) * step;
					}
				}
				else
				{
					if(vimode==FI)
					{
						result[SITE] = vi_ramp.GetMeasResult(SITE, MIRET, Trig_Point[SITE] - 1);
					}
					else
					{
						result[SITE] = vi_ramp.GetMeasResult(SITE, MVRET, Trig_Point[SITE] - 1);
					}	
				}
			}
			else
				result[SITE] = ERROR_RES;
		}
		return TRUE;
	}
	//**********************************************one pin ramp same pin capture*********************************************************
	// FOVI ramp and capture 
	BOOL ramp(FOVI vi_ramp, VIMode vimode, FOVI_VRNG v_range, FOVI_IRNG i_range, double start_point, double stop_point, double step, int interval, const char* str_trig, const char* str_trigstop, int stop_sample,TRIG_MODE trig_mode, double trig_level, BOOL result_type, double *result)
	{
		string trig(str_trig);
		string trigstop(str_trigstop);
		if (interval < 10)	return FALSE;
		if (step == 0)	return FALSE;
		int samples;
		double pat[MAX_SAMPLES];
		samples = int(fabs((stop_point - start_point) / step));
		if ((samples <= 1) || (samples > MAX_SAMPLES)){
			samples = MAX_SAMPLES;
		}
		if (stop_sample)
		{
			stop_sample = samples - 1;
		}
		vi_ramp.Set(vimode, start_point, v_range, i_range, RELAY_ON, 1);
		STSAWGCreateRampData(&pat[0], samples, 1, start_point, stop_point);
		vi_ramp.AwgClear();
		vi_ramp.AwgLoader("awg", FV, v_range, i_range, pat, samples);
		vi_ramp.AwgSelect("awg", 0, samples - 1, stop_sample, interval);
		if (!START_DELAY)
			delay_ms(START_DELAY);
		if (trig == "VTrig")
		{
			vi_ramp.SetMeasVTrig(trig_level, trig_mode);
		}
		else if (trig == "ITrig")
		{
			vi_ramp.SetMeasITrig(trig_level, trig_mode);
		}
		vi_ramp.MeasureVI(samples, interval, MEAS_AWG);
		STSEnableAWG(&vi_ramp);
		STSEnableMeas(&vi_ramp);
		STSAWGRunTriggerStop(&vi_ramp, &vi_ramp);
		int Trig_Point[SITE_NUM];
		SERIAL{
			Trig_Point[SITE] = (int)vi_ramp.GetMeasResult(SITE, MIRET, TRIG_RESULT);
			if (Trig_Point[SITE]==0)
			{
				Trig_Point[SITE]=1;
			}
			if (((Trig_Point[SITE]) <=samples )){
				if (!result_type)
				{
					if (start_point < stop_point)
					{
						result[SITE] = start_point + (Trig_Point[SITE] - 1) * step;
					}
					else
					{
						result[SITE] = start_point - (Trig_Point[SITE] - 1) * step;
					}
				}
				else
				{
					if(vimode==FI)
					{
						result[SITE] = vi_ramp.GetMeasResult(SITE, MIRET, Trig_Point[SITE] - 1);
					}
					else
					{
						result[SITE] = vi_ramp.GetMeasResult(SITE, MVRET, Trig_Point[SITE] - 1);
					}	
				}
			}
			else {
				result[SITE] = ERROR_RES;
			}
		}
		return TRUE;
	}
	// FPVI ramp and capture 
	BOOL ramp(FPVI10 vi_ramp, VIMode vimode, FPVI10_VRNG v_range, FPVI10_IRNG i_range, double start_point, double stop_point, double step, int interval, const char* str_trig, const char* str_trigstop, int stop_sample, TRIG_MODE trig_mode, double trig_level, BOOL result_type, double *result)
	{
		string trig(str_trig);
		string trigstop(str_trigstop);
		if (interval < 10)	return FALSE;
		if (step == 0)	return FALSE;
		int samples;
		double pat[MAX_SAMPLES];
		samples = int(fabs((stop_point - start_point) / step));
		if ((samples <= 1) || (samples > MAX_SAMPLES)){
			samples = MAX_SAMPLES;
		}
		if (stop_sample)
		{
			stop_sample = samples - 1;
		}
		vi_ramp.Set(vimode, start_point, v_range, i_range, RELAY_ON, 1);
		STSAWGCreateRampData(&pat[0], samples, 1, start_point, stop_point);
		vi_ramp.AwgClear();
		vi_ramp.AwgLoader("awg", FV, v_range, i_range, pat, samples);
		vi_ramp.AwgSelect("awg", 0, samples - 1, stop_sample, interval);
		if (!START_DELAY)
			delay_ms(START_DELAY);
		if (trig == "VTrig")
		{
			vi_ramp.SetMeasVTrig(trig_level, trig_mode);
		}
		else if (trig == "ITrig")
		{
			vi_ramp.SetMeasITrig(trig_level, trig_mode);
		}
		vi_ramp.MeasureVI(samples, interval, MEAS_AWG);
		STSEnableAWG(&vi_ramp);
		STSEnableMeas(&vi_ramp);
		STSAWGRunTriggerStop(&vi_ramp, &vi_ramp);
		int Trig_Point[SITE_NUM];
		SERIAL{
			Trig_Point[SITE] = (int)vi_ramp.GetMeasResult(SITE, MIRET, TRIG_RESULT);
			if (Trig_Point[SITE]==0)
			{
				Trig_Point[SITE]=1;
			}
			if (((Trig_Point[SITE]) <=samples )){
				if (!result_type)
				{
					if (start_point < stop_point)
					{
						result[SITE] = start_point + (Trig_Point[SITE] - 1) * step;
					}
					else
					{
						result[SITE] = start_point - (Trig_Point[SITE] - 1) * step;
					}
				}
				else
				{
					if(vimode==FI)
					{
						result[SITE] = vi_ramp.GetMeasResult(SITE, MIRET, Trig_Point[SITE] - 1);
					}
					else
					{
						result[SITE] = vi_ramp.GetMeasResult(SITE, MVRET, Trig_Point[SITE] - 1);
					}	
				}
			}
			else {
				result[SITE] = ERROR_RES;
			}
		}
		return TRUE;
	}

	// FPVI ramp FOVI capture QVM MEAS
	BOOL ramp(FPVI10 vi_ramp, VIMode vimode, FPVI10_VRNG v_range, FPVI10_IRNG i_range, double start_point, double stop_point, double step, int interval, FOVI vi_cap, const char* str_trig, const char* str_trigstop, INT stop_sample, TRIG_MODE trig_mode, double trig_level, double *result)
	{
		string trig(str_trig);
		string trigstop(str_trigstop);
		if (interval < 10)	return FALSE;
		if (step == 0)	return FALSE;
		int samples;
		double pat[MAX_SAMPLES];
		samples = int(fabs((stop_point - start_point) / step + 1));
		if ((samples <= 1) || (samples > MAX_SAMPLES)){
			samples = MAX_SAMPLES;
		}
		if (stop_sample)
		{
			stop_sample = samples - 1;
		}
		vi_ramp.Set(vimode, start_point, v_range, i_range, RELAY_ON, 1);
		vi_ramp.AwgClear();
		STSAWGCreateRampData(&pat[0], samples, 1, start_point, stop_point);
		vi_ramp.AwgLoader("awg", vimode, v_range, i_range, pat, samples);
		vi_ramp.AwgSelect("awg", 0, samples - 1, stop_sample, interval);
		if (trig == "VTrig")
		{
			vi_cap.SetMeasVTrig(trig_level, trig_mode);
		}
		else if (trig == "ITrig")
		{
			vi_cap.SetMeasITrig(trig_level, trig_mode);
		}
		if (!START_DELAY)
			delay_ms(START_DELAY);
		vi_ramp.MeasureVI(samples, interval, MEAS_AWG);
		vi_cap.MeasureVI(samples, interval, MEAS_AWG);
		STSEnableAWG(&vi_ramp);
		STSEnableMeas(&vi_cap, &vi_ramp);
		STSAWGRunTriggerStop(&vi_cap, &vi_cap, &vi_ramp);
		int Trig_Point[SITE_NUM];
		double trig_result[SITE_NUM];
		SERIAL{
			Trig_Point[SITE] = (int)vi_cap.GetMeasResult(SITE, TRIG_RESULT);
			if (Trig_Point[SITE] == 0)
			{
				Trig_Point[SITE] = 1;
			}
			else if (((Trig_Point[SITE]) <= samples)){

				if (start_point < stop_point)
				{
					trig_result[SITE] = start_point + (Trig_Point[SITE] - 1) * step;
				}
				else
				{
					trig_result[SITE] = start_point - (Trig_Point[SITE] - 1) * step;
				}
			}
			else
				trig_result[SITE] = 0;
		}
			SERIAL
		{
			BEGIN_SINGLE_SITE(SITE)
			vi_ramp.Set(vimode, trig_result[SITE], v_range, i_range, RELAY_ON, 1);
			END_SINGLE_SITE()
		}
		delay_ms(1);
		qvm0.MeasureLADC(200, 5, QVM_LADC_500MV, QVM_LADC_40KHz, MEAS_NORMAL);//sample is 200;interval time is 5us 
		SERIAL result[SITE] = qvm0.GetMeasResult(SITE, AVERAGE_RESULT);

		return TRUE;
	}

	// dual FPVI ramp FOVI capture
	BOOL ramp(FPVI10 vi_ramp, FPVI10 vi_ramp1, VIMode vimode, FPVI10_VRNG v_range, FPVI10_IRNG i_range, double start_point, double stop_point, double step, int interval, FOVI vi_cap, const char* str_trig, const char* str_trigstop, INT stop_sample, TRIG_MODE trig_mode, double trig_level, BOOL result_type, double *result)
	{
		string trig(str_trig);
		string trigstop(str_trigstop);
		if (interval < 10)	return FALSE;
		if (step == 0)	return FALSE;
		int samples;
		double pat[MAX_SAMPLES];
		samples = int(fabs((stop_point - start_point) / step + 1));
		if ((samples <= 1) || (samples > MAX_SAMPLES)){
			samples = MAX_SAMPLES;
		}
		if (stop_sample)
		{
			stop_sample = samples - 1;
		}
		vi_ramp.Set(vimode, start_point, v_range, i_range, RELAY_ON, 1);
		vi_ramp1.Set(vimode, start_point, v_range, i_range, RELAY_ON, 1);
		vi_ramp.AwgClear();
		vi_ramp1.AwgClear();
		STSAWGCreateRampData(&pat[0], samples, 1, start_point, stop_point);
		vi_ramp.AwgLoader("awg", vimode, v_range, i_range, pat, samples);
		vi_ramp1.AwgLoader("awg", vimode, v_range, i_range, pat, samples);
		vi_ramp.AwgSelect("awg", 0, samples - 1, stop_sample, interval);
		vi_ramp1.AwgSelect("awg", 0, samples - 1, stop_sample, interval);
		if (trig == "VTrig")
		{
			vi_cap.SetMeasVTrig(trig_level, trig_mode);
		}
		else if (trig == "ITrig")
		{
			vi_cap.SetMeasITrig(trig_level, trig_mode);
		}
		if (!START_DELAY)
			delay_ms(START_DELAY);
		vi_ramp.MeasureVI(samples, interval, MEAS_AWG);
		vi_ramp1.MeasureVI(samples, interval, MEAS_AWG);
		vi_cap.MeasureVI(samples, interval, MEAS_AWG);
		STSEnableAWG(&vi_ramp, &vi_ramp1);
		STSEnableMeas(&vi_cap, &vi_ramp, &vi_ramp1);
		STSAWGRunTriggerStop(&vi_cap, &vi_cap, &vi_ramp, &vi_ramp1);
		int Trig_Point[SITE_NUM];
		SERIAL{
			Trig_Point[SITE] = (int)vi_cap.GetMeasResult(SITE, TRIG_RESULT);
			if (Trig_Point[SITE] == 0)
			{
				Trig_Point[SITE] = 1;
			}
			if (((Trig_Point[SITE]) <= samples)){
				if (!result_type)
				{
					if (start_point < stop_point)
					{
						result[SITE] = (start_point + (Trig_Point[SITE] - 1) * step)*2;
					}
					else
					{
						result[SITE] = (start_point - (Trig_Point[SITE] - 1) * step)*2;
					}
				}
				else
				{
					if (vimode == FI)
					{
						result[SITE] = vi_ramp.GetMeasResult(SITE, MIRET, Trig_Point[SITE] - 1) + vi_ramp1.GetMeasResult(SITE, MIRET, Trig_Point[SITE] - 1);
					}
					else
					{
						result[SITE] = vi_ramp.GetMeasResult(SITE, MVRET, Trig_Point[SITE] - 1) + vi_ramp1.GetMeasResult(SITE, MVRET, Trig_Point[SITE] - 1);
					}
				}
			}
			else
				result[SITE] = ERROR_RES;
		}

		return TRUE;
	}



	// qual FPVI ramp FOVI capture
	BOOL ramp(FPVI10 vi_ramp, FPVI10 vi_ramp1, FPVI10 vi_ramp2, FPVI10 vi_ramp3, VIMode vimode, FPVI10_VRNG v_range, FPVI10_IRNG i_range, double start_point, double stop_point, double step, int interval, FOVI vi_cap, const char* str_trig, const char* str_trigstop, INT stop_sample, TRIG_MODE trig_mode, double trig_level, BOOL result_type, double *result)
	{
		string trig(str_trig);
		string trigstop(str_trigstop);
		if (interval < 10)	return FALSE;
		if (step == 0)	return FALSE;
		int samples;
		double pat[MAX_SAMPLES];
		samples = int(fabs((stop_point - start_point) / step + 1));
		if ((samples <= 1) || (samples > MAX_SAMPLES)){
			samples = MAX_SAMPLES;
		}
		if (stop_sample)
		{
			stop_sample = samples - 1;
		}
		vi_ramp.Set(vimode, start_point, v_range, i_range, RELAY_ON, 1);
		vi_ramp1.Set(vimode, start_point, v_range, i_range, RELAY_ON, 1);
		vi_ramp2.Set(vimode, start_point, v_range, i_range, RELAY_ON, 1);
		vi_ramp3.Set(vimode, start_point, v_range, i_range, RELAY_ON, 1);
		vi_ramp.AwgClear();
		vi_ramp1.AwgClear();
		vi_ramp2.AwgClear();
		vi_ramp3.AwgClear();
		STSAWGCreateRampData(&pat[0], samples, 1, start_point, stop_point);
		vi_ramp.AwgLoader("awg1", vimode, v_range, i_range, pat, samples);
		vi_ramp1.AwgLoader("awg2", vimode, v_range, i_range, pat, samples);
		vi_ramp2.AwgLoader("awg3", vimode, v_range, i_range, pat, samples);
		vi_ramp3.AwgLoader("awg4", vimode, v_range, i_range, pat, samples);
		vi_ramp.AwgSelect("awg1", 0, samples - 1, stop_sample, interval);
		vi_ramp1.AwgSelect("awg2", 0, samples - 1, stop_sample, interval);
		vi_ramp2.AwgSelect("awg3", 0, samples - 1, stop_sample, interval);
		vi_ramp3.AwgSelect("awg4", 0, samples - 1, stop_sample, interval);
		if (trig == "VTrig")
		{
			vi_cap.SetMeasVTrig(trig_level, trig_mode);
		}
		else if (trig == "ITrig")
		{
			vi_cap.SetMeasITrig(trig_level, trig_mode);
		}
		if (!START_DELAY)
			delay_ms(START_DELAY);
		vi_ramp.MeasureVI(samples, interval, MEAS_AWG);
		vi_ramp1.MeasureVI(samples, interval, MEAS_AWG);
		vi_ramp2.MeasureVI(samples, interval, MEAS_AWG);
		vi_ramp3.MeasureVI(samples, interval, MEAS_AWG);
		vi_cap.MeasureVI(samples, interval, MEAS_AWG);
		STSEnableAWG(&vi_ramp, &vi_ramp1,&vi_ramp2, &vi_ramp3);
		STSEnableMeas(&vi_cap, &vi_ramp, &vi_ramp1,&vi_ramp2, &vi_ramp3);
		STSAWGRunTriggerStop(&vi_cap, &vi_cap, &vi_ramp, &vi_ramp1,&vi_ramp2, &vi_ramp3);
		//STSAWGRun();
		int Trig_Point[SITE_NUM];
		SERIAL{
			Trig_Point[SITE] = (int)vi_cap.GetMeasResult(SITE, TRIG_RESULT);
			if (Trig_Point[SITE] == 0)
			{
				Trig_Point[SITE] = 1;
			}
			if (((Trig_Point[SITE]) <= samples)){
				if (!result_type)
				{
					if (start_point < stop_point)
					{
						result[SITE] = (start_point + (Trig_Point[SITE] - 1) * step) * 4;
					}
					else
					{
						result[SITE] = (start_point - (Trig_Point[SITE] - 1) * step) * 4;
					}
				}
				else
				{
					if (vimode == FI)
					{
						result[SITE] = vi_ramp.GetMeasResult(SITE, MIRET, Trig_Point[SITE] - 1) + vi_ramp1.GetMeasResult(SITE, MIRET, Trig_Point[SITE] - 1) + vi_ramp2.GetMeasResult(SITE, MIRET, Trig_Point[SITE] - 1) + vi_ramp3.GetMeasResult(SITE, MIRET, Trig_Point[SITE] - 1);
					}
					else
					{
						result[SITE] = vi_ramp.GetMeasResult(SITE, MVRET, Trig_Point[SITE] - 1) + vi_ramp1.GetMeasResult(SITE, MVRET, Trig_Point[SITE] - 1) + vi_ramp2.GetMeasResult(SITE, MVRET, Trig_Point[SITE] - 1) + vi_ramp3.GetMeasResult(SITE, MVRET, Trig_Point[SITE] - 1);
					}
				}
			}
			else
				result[SITE] = ERROR_RES;
		}

		return TRUE;
	}




};