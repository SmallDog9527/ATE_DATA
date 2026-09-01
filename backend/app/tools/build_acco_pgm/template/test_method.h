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
#include "Pin_Channel_define.h"
#define MAX_SAMPLES 2000
#define ERROR_RES	9999
#define START_DELAY	0

class Test_Method
{
public:
	Test_Method() {}
	~Test_Method() {}

	FOVIe_VRNG get_fovie_v_range(double v)
	{
		if (v < 0)
			v = -v;
		if (v <= 1)
			return FOVIe_1V;
		else if (v <= 5)
			return FOVIe_5V;
		else if (v <= 10)
			return FOVIe_10V;
		else if (v <= 20)
			return FOVIe_20V;
		else if (v <= 40)
			return FOVIe_40V;
		else
			return FOVIe_5V;
	}

	FOVIe_IRNG get_fovie_i_range(double i)
	{
		if (i < 0)
			i = -i;
		else if (i <= 10e-6)
			return FOVIe_10UA;
		else if (i <= 100e-6)
			return FOVIe_100UA;
		else if (i <= 1e-3)
			return FOVIe_1MA;
		else if (i <= 10e-3)
			return FOVIe_10MA;
		else if (i <= 100e-3)
			return FOVIe_100MA;
		else if (i <= 1)
			return FOVIe_1A;
		else
			return FOVIe_1MA;
	}
	// ACM ramp ACM capture UVLO
	BOOL ramp(ACM acm_ramp, ACM acm_cap, double start_point, double stop_point, double step, int interval, double trig_level, TRIG_MODE trig_mode, double *result)
	{
		if (interval < 10)	return FALSE;
		if (step == 0)	return FALSE;

		ACM_VRNG v_range = ACM_N2P18V;
		ACM_IRNG i_range = ACM_500MA;


		int samples;
		double pat[MAX_SAMPLES];
		samples = int(fabs((stop_point - start_point) / step));
		if ((samples <= 1) || (samples > MAX_SAMPLES)){
			samples = MAX_SAMPLES;
		}

		acm_cap.Set(FI, 0, ACM_N2P18V, ACM_20UA, ACM_RELAY_ON);

		STSAWGCreateRampData(&pat[0], samples, 1, start_point, stop_point);
		acm_ramp.AwgClear();
		acm_ramp.AwgLoader("awg", FV, v_range, i_range, pat, samples);
		acm_ramp.AwgSelect("awg", 0, samples - 1, samples - 1, interval);
		acm_cap.SetMeasVTrig(trig_level, trig_mode);

		acm_ramp.Set(FV, start_point, v_range, i_range, ACM_RELAY_ON);
		acm_ramp.MeasureVI(ACM_MV,samples, interval,  MEAS_AWG);
		acm_cap.MeasureVI(ACM_MV,samples, interval, MEAS_AWG);

		STSEnableAWG(&acm_ramp, &acm_cap);
		STSEnableMeas(&acm_ramp, &acm_cap);
		STSAWGRunTriggerStop(&acm_cap, &acm_ramp, &acm_cap);

		int Trig_Point[SITE_NUM];
		SERIAL{

			Trig_Point[SITE] = (int)acm_cap.GetMeasResult(SITE, TRIG_RESULT);
			if (((Trig_Point[SITE]) > 2) && ((Trig_Point[SITE]) < samples - 2)){
				//result[SITE] = start_point + (Trig_Point[SITE] - 1) * step;
				result[SITE] = acm_ramp.GetMeasResult(SITE, Trig_Point[SITE] - 1);
			}
			else {
				result[SITE] = ERROR_RES;
			}
		}

		return TRUE;
	}

	BOOL ramp(FOVIe fovie_ramp, FOVIe fovie_cap, double start_point, double stop_point, double step, int interval, double trig_level, TRIG_MODE trig_mode, double *result)
	{
		if (interval < 10)	return FALSE;
		if (step == 0)	return FALSE;

		FOVIe_VRNG v_range = FOVIe_5V;
		FOVIe_IRNG i_range = FOVIe_1A;
		if (fabs(start_point) < fabs(stop_point))
			v_range = get_fovie_v_range(stop_point);
		else
			v_range = get_fovie_v_range(start_point);

		int samples;
		double pat[MAX_SAMPLES];
		samples = int(fabs((stop_point - start_point) / step));
		if ((samples <= 1) || (samples > MAX_SAMPLES)){
			samples = MAX_SAMPLES;
		}

		fovie_cap.Set(FI, 0, FOVIe_10V, FOVIe_10UA, FOVIe_RELAY_SENSE_ON);

		STSAWGCreateRampData(&pat[0], samples, 1, start_point, stop_point);
		fovie_ramp.AwgClear();
		fovie_ramp.AwgLoader("awg", FV, v_range, i_range, pat, samples);
		fovie_ramp.AwgSelect("awg", 0, samples - 1, samples - 1, interval);
		fovie_cap.SetMeasVTrig(trig_level, trig_mode);

		fovie_ramp.Set(FV, start_point, v_range, i_range, FOVIe_RELAY_ON);
		fovie_ramp.MeasureVI(samples, interval, FOVIe_MI_X1, MEAS_AWG);
		fovie_cap.MeasureVI(samples, interval, FOVIe_MI_X1, MEAS_AWG);


		STSEnableAWG(&fovie_ramp, &fovie_cap);
		STSEnableMeas(&fovie_ramp, &fovie_cap);
		STSAWGRunTriggerStop(&fovie_cap, &fovie_ramp, &fovie_cap);

		int Trig_Point[SITE_NUM];
		SERIAL{
	
			Trig_Point[SITE] = (int)fovie_cap.GetMeasResult(SITE, MVRET, TRIG_RESULT);
			if (((Trig_Point[SITE]) > 2) && ((Trig_Point[SITE]) < samples - 2)){
				//result[SITE] = start_point + (Trig_Point[SITE] - 1) * step;
				result[SITE] = fovie_ramp.GetMeasResult(SITE, MVRET, Trig_Point[SITE] - 1);
			}
			else {
				result[SITE] = ERROR_RES;
			}
		}

		return TRUE;
	}

	BOOL ramp(ACM acm_ramp, ACM acm_cap, ACM_VRNG v_range, ACM_IRNG i_range, double start_point, double stop_point, double step, int interval, double trig_level, TRIG_MODE trig_mode, double *result)
	{
		if (interval < 10)	return FALSE;
		if (step == 0)	return FALSE;

		int samples;
		double pat[MAX_SAMPLES];
		samples = int(fabs((stop_point - start_point) / step + 1));
		if ((samples <= 1) || (samples > MAX_SAMPLES)){
			samples = MAX_SAMPLES;
		}
	
		acm_cap.Set(FI, 0, ACM_N2P18V, ACM_20UA, ACM_RELAY_ON);//CTRL need high impedance meter
		delay_ms(1);
		STSAWGCreateRampData(&pat[0], samples, 1, start_point, stop_point);	
		acm_ramp.AwgClear();
		acm_ramp.AwgLoader("awg", FV, v_range, i_range, pat, samples);
		acm_ramp.AwgSelect("awg", 0, samples - 1, samples - 1, interval);
		acm_cap.SetMeasVTrig(trig_level, trig_mode);
  
		acm_ramp.Set(FV, start_point, v_range, i_range, ACM_RELAY_ON);
		if (!START_DELAY)
			delay_ms(START_DELAY);
		acm_ramp.MeasureVI(ACM_MV,samples, interval, MEAS_AWG);
		acm_cap.MeasureVI(ACM_MV,samples, interval, MEAS_AWG);

		STSEnableAWG(&acm_ramp);
		STSEnableMeas(&acm_ramp, &acm_cap);
		STSAWGRunTriggerStop(&acm_cap, &acm_ramp, &acm_cap);
		//STSAWGRun();

		int Trig_Point[SITE_NUM];
		SERIAL{
			Trig_Point[SITE] = (int)acm_cap.GetMeasResult(SITE, TRIG_RESULT);
			if (((Trig_Point[SITE]) > 2) && ((Trig_Point[SITE]) < samples - 2))
			{
					result[SITE] = acm_ramp.GetMeasResult(SITE, Trig_Point[SITE] - 1);
			}
			else {
				result[SITE] = ERROR_RES;
			}
		}

		return TRUE;
	}


	//BOOL ramp_readregister(ACM acm_ramp,  ACM_VRNG v_range, ACM_IRNG i_range, double start_point, double stop_point, double step, double trig_level, double *result)
	//{
	//	for (double i = start_point; i <= stop_point; i = i + step)
	//	
	//	{
	//		double adresult[8] = { 0 };

	//		BOOL is_trigged[Num_Site];

	//		SERIAL  is_trigged[SITE] = !AstGetSiteStatus(SITE);


	//		ACM_VOUT.Set(FV, i, v_range, i_range, ACM_RELAY_ON);
	//		delay_ms(1);

	//		dcm.I2CReadData(I2C_ADDR_DEVICE_FUC_75K, 0x00, 1);//通过read寄存器读出来
	//		delay_ms(1);
	//		 
	//		SERIAL adresult[SITE] = dcm.I2CGetReadData(SITE, 0);
 //
	// 
	//		SERIAL{

	//			if (!is_trigged[SITE] && (adresult[SITE] < trig_level))

	//			{
	//				is_trigged[SITE] = TRUE;
	//				 result[SITE] = i;
	//			 
 // 

	//			}

	//			else if (!is_trigged[SITE] && (adresult[SITE] == 255))

	//			{
	//				result[SITE] = i;
	//			}

	//		}






	//		BOOL bBreak = TRUE;

	//		SERIAL{
	//			if (!is_trigged[SITE])
	//			bBreak = FALSE;
	//		}

	//			if (bBreak)

	//				break;

	//	
	//	}

	//	 
	//	return TRUE;
	//}



	BOOL ramp(ACM acm_ramp, ACM acm_cap, QVMe qvm_cap, ACM_VRNG v_range, ACM_IRNG i_range, double start_point, double stop_point, double step, int interval, double trig_level, TRIG_MODE trig_mode, double *result)
	{
		if (interval < 10)	return FALSE;
		if (step == 0)	return FALSE;

		int samples;
		double pat[MAX_SAMPLES];
		samples = int(fabs((stop_point - start_point) / step + 1));
		if ((samples <= 1) || (samples > MAX_SAMPLES)){
			samples = MAX_SAMPLES;
		}

		STSAWGCreateRampData(&pat[0], samples, 1, start_point, stop_point);
		acm_ramp.AwgClear();
		acm_ramp.AwgLoader("awg", FV, v_range, i_range, pat, samples);
		acm_ramp.AwgSelect("awg", 0, samples - 1, samples - 1, interval);
		acm_cap.SetMeasVTrig(trig_level, trig_mode);

		acm_ramp.Set(FV, start_point, v_range, i_range, ACM_RELAY_ON, 1);
		if (!START_DELAY)
			delay_ms(START_DELAY);
		acm_ramp.MeasureVI(ACM_MV, samples, interval, MEAS_AWG);
		acm_cap.MeasureVI(ACM_MV, samples, interval, MEAS_AWG);
		qvm_cap.MeasureLADC(samples, interval, QVMe_LADC_200MV, QVMe_LADC_40KHz, MEAS_AWG);
		STSEnableAWG(&acm_ramp);
		STSEnableMeas(&acm_ramp, &acm_cap, &qvm_cap);
		STSAWGRunTriggerStop(&acm_cap, &acm_ramp, &acm_cap, &qvm_cap);
		//STSAWGRun();

		int Trig_Point[SITE_NUM];
		SERIAL{
			Trig_Point[SITE] = (int)acm_cap.GetMeasResult(SITE, TRIG_RESULT);
			if (((Trig_Point[SITE]) > 2) && ((Trig_Point[SITE]) < samples - 2))
			{
				qvm0.MeasureLADC(samples, interval, QVMe_LADC_200MV, QVMe_LADC_40KHz, MEAS_AWG);
				result[SITE] = qvm0.GetMeasResult(SITE, Trig_Point[SITE] - 1);
			}
			else {
				result[SITE] = ERROR_RES;
			}
		}

		return TRUE;
	}
	
	BOOL ramp(FPVIe fpvi_ramp, ACM acm_cap, QVMe qvm_cap, FPVIe_VRNG v_range, FPVIe_IRNG i_range, double start_point, double stop_point, double step, int interval, double trig_level, TRIG_MODE trig_mode, double *result)
	{
		if (interval < 10)	return FALSE;
		if (step == 0)	return FALSE;

		int samples;
		double pat[MAX_SAMPLES];
		samples = int(fabs((stop_point - start_point) / step + 1));
		if ((samples <= 1) || (samples > MAX_SAMPLES)){
			samples = MAX_SAMPLES;
		}

		STSAWGCreateRampData(&pat[0], samples, 1, start_point, stop_point);
		fpvi_ramp.AwgClear();
		fpvi_ramp.AwgLoader("awg", FI, v_range, i_range, pat, samples);
		fpvi_ramp.AwgSelect("awg", 0, samples - 1, samples - 1, interval);
		acm_cap.SetMeasVTrig(trig_level, trig_mode);

		fpvi_ramp.Set(FI, start_point, v_range, i_range, FPVIe_RELAY_ON, 1);
		if (!START_DELAY)
			delay_ms(START_DELAY);
		fpvi_ramp.MeasureVI(samples, interval, FPVIe_MV_X1, FPVIe_MI_X1,MEAS_AWG);
		acm_cap.MeasureVI(ACM_MV, samples, interval, MEAS_AWG);
		qvm_cap.MeasureLADC(samples, interval, QVMe_LADC_200MV, QVMe_LADC_40KHz, MEAS_AWG);
		STSEnableAWG(&fpvi_ramp);
		STSEnableMeas(&fpvi_ramp, &acm_cap, &qvm_cap);
		STSAWGRunTriggerStop(&acm_cap, &fpvi_ramp, &acm_cap, &qvm_cap);
		//STSAWGRun();

		int Trig_Point[SITE_NUM];
		SERIAL{
			Trig_Point[SITE] = (int)acm_cap.GetMeasResult(SITE, TRIG_RESULT);
			if (((Trig_Point[SITE]) > 2) && ((Trig_Point[SITE]) < samples - 2))
			{
				qvm0.MeasureLADC(samples, interval, QVMe_LADC_200MV, QVMe_LADC_40KHz, MEAS_AWG);
				result[SITE] = qvm0.GetMeasResult(SITE, Trig_Point[SITE] - 1);
			}
			else {
				result[SITE] = ERROR_RES;
			}
		}

		return TRUE;
	}


	BOOL ramp(FOVIe fovie_ramp, ACM acm_cap, FOVIe_VRNG v_range, FOVIe_IRNG i_range, double start_point, double stop_point, double step, int interval, double trig_level, TRIG_MODE trig_mode, double *result)
	{
		if (interval < 10)	return FALSE;
		if (step == 0)	return FALSE;

		int samples;
		double pat[MAX_SAMPLES];
		samples = int(fabs((stop_point - start_point) / step + 1));
		if ((samples <= 1) || (samples > MAX_SAMPLES)){
			samples = MAX_SAMPLES;
		}

		acm_cap.Set(FI, 0, ACM_N2P18V, ACM_20UA, ACM_RELAY_ON);//CTRL need high impedance meter
		delay_ms(1);
		STSAWGCreateRampData(&pat[0], samples, 1, start_point, stop_point);
		fovie_ramp.AwgClear();
		fovie_ramp.AwgLoader("awg", FV, v_range, i_range, pat, samples);
		fovie_ramp.AwgSelect("awg", 0, samples - 1, samples - 1, interval);
		acm_cap.SetMeasVTrig(trig_level, trig_mode);

		fovie_ramp.Set(FV, start_point, v_range, i_range, FOVIe_RELAY_ON, 1);
		if (!START_DELAY)
		delay_ms(START_DELAY);
		fovie_ramp.MeasureVI(samples, interval, FOVIe_MI_X1, MEAS_AWG);
		acm_cap.MeasureVI(ACM_MV, samples, interval, MEAS_AWG);
		STSEnableAWG(&fovie_ramp);
		STSEnableMeas(&fovie_ramp, &acm_cap);
		STSAWGRunTriggerStop(&acm_cap, &fovie_ramp, &acm_cap);
		//STSAWGRun();

		int Trig_Point[SITE_NUM];
		SERIAL{
			Trig_Point[SITE] = (int)acm_cap.GetMeasResult(SITE, TRIG_RESULT);
			if (((Trig_Point[SITE]) > 2) && ((Trig_Point[SITE]) < samples - 2))
			{
				result[SITE] = fovie_ramp.GetMeasResult(SITE, MVRET,Trig_Point[SITE] - 1);
			}
			else {
				result[SITE] = ERROR_RES;
			}
		}

		fovie_ramp.Set(FV, 0, v_range, i_range, FOVIe_RELAY_ON);
		fovie_ramp.Set(FV, 0, v_range, i_range, FOVIe_RELAY_OFF);
		return TRUE;
	}
	 

	BOOL ramp_S(FOVIe fovie_ramp, ACM acm_cap, FOVIe_VRNG v_range, FOVIe_IRNG i_range, double start_point, double stop_point, double step, int interval, double trig_level, TRIG_MODE trig_mode, double *result)
	{
		if (interval < 10)	return FALSE;
		if (step == 0)	return FALSE;

		int samples;
		double pat[MAX_SAMPLES];
		samples = int(fabs((stop_point - start_point) / step + 1));
		if ((samples <= 1) || (samples > MAX_SAMPLES)){
			samples = MAX_SAMPLES;
		}

		acm_cap.Set(FI, 0, ACM_N2P18V, ACM_20UA, ACM_RELAY_ON);//CTRL need high impedance meter
		delay_ms(1);
		STSAWGCreateRampData(&pat[0], samples, 1, start_point, stop_point);
		fovie_ramp.AwgClear();
		fovie_ramp.AwgLoader("awg", FV, v_range, i_range, pat, samples);
		fovie_ramp.AwgSelect("awg", 0, samples - 1, samples - 1, interval);
		acm_cap.SetMeasVTrig(trig_level, trig_mode);

		fovie_ramp.Set(FV, start_point, v_range, i_range, FOVIe_RELAY_ON, 1);
		if (!START_DELAY)
			delay_ms(START_DELAY);
		fovie_ramp.MeasureVI(samples, interval, FOVIe_MI_X1, MEAS_AWG);
		acm_cap.MeasureVI(ACM_MV, samples, interval, MEAS_AWG);
		STSEnableAWG(&fovie_ramp);
		STSEnableMeas(&fovie_ramp, &acm_cap);
		STSAWGRunTriggerStop(&acm_cap, &fovie_ramp, &acm_cap);
		//STSAWGRun();

		int Trig_Point[SITE_NUM];
		SERIAL{
			Trig_Point[SITE] = (int)acm_cap.GetMeasResult(SITE, TRIG_RESULT);
			if (((Trig_Point[SITE]) > 2) && ((Trig_Point[SITE]) < samples - 2))
			{
				result[SITE] = fovie_ramp.GetMeasResult(SITE, MVRET, Trig_Point[SITE] - 2);
			}
			else {
				result[SITE] = ERROR_RES;
			}
		}

		fovie_ramp.Set(FV, 0, v_range, i_range, FOVIe_RELAY_ON);
		fovie_ramp.Set(FV, 0, v_range, i_range, FOVIe_RELAY_OFF);
		return TRUE;
	}

	

	BOOL ramp(FOVIe fovie_ramp, FOVIe fovie_cap, FOVIe_VRNG v_range, FOVIe_IRNG i_range, double start_point, double stop_point, double step, int interval, double trig_level, TRIG_MODE trig_mode, double *result)
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

		STSAWGCreateRampData(&pat[0], samples, 1, start_point, stop_point);
		fovie_ramp.AwgClear();
		fovie_ramp.AwgLoader("awg", FV, v_range, i_range, pat, samples);
		fovie_ramp.AwgSelect("awg", 0, samples - 1, samples - 1, interval);
		fovie_cap.SetMeasVTrig(trig_level, trig_mode);

		fovie_ramp.Set(FV, start_point, v_range, i_range, FOVIe_RELAY_ON, 1);
		if (!START_DELAY)
			delay_ms(START_DELAY);

		fovie_ramp.MeasureVI(samples, interval, FOVIe_MI_X1, MEAS_AWG);
		fovie_cap.MeasureVI(samples, interval, FOVIe_MI_X1, MEAS_AWG);

		STSEnableAWG(&fovie_ramp, &fovie_cap);
		STSEnableMeas(&fovie_ramp, &fovie_cap);
		STSAWGRunTriggerStop(&fovie_cap, &fovie_ramp, &fovie_cap);
		//		STSAWGRun();

		int Trig_Point[SITE_NUM];
		SERIAL{
			Trig_Point[SITE] = (int)fovie_cap.GetMeasResult(SITE, MVRET, TRIG_RESULT);
			if (((Trig_Point[SITE]) > 2) && ((Trig_Point[SITE]) < samples - 2)){
				//result[SITE] = start_point + (Trig_Point[SITE] - 1) * step;
				result[SITE] = fovie_ramp.GetMeasResult(SITE, MVRET, Trig_Point[SITE] - 1);
			}
			else {
				result[SITE] = ERROR_RES;
			}
		}

		return TRUE;
	}

	BOOL ramp(FOVIe fovie_ramp, FOVIe_VRNG v_range, FOVIe_IRNG i_range, double start_point, double stop_point, double step, int interval, double trig_level, TRIG_MODE trig_mode, double *result)
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
		fovie_ramp.AwgClear();
		fovie_ramp.AwgLoader("awg", FV, v_range, i_range, pat, samples);
		fovie_ramp.AwgSelect("awg", 0, samples - 1, samples - 1, interval);
		fovie_ramp.Set(FV, start_point, v_range, i_range, FOVIe_RELAY_ON, 1);
		if (!START_DELAY)
			delay_ms(START_DELAY);

		fovie_ramp.SetMeasITrig(trig_level, trig_mode);
		fovie_ramp.MeasureVI(samples, interval, FOVIe_MI_X1, MEAS_AWG);
		STSEnableAWG(&fovie_ramp);
		STSEnableMeas(&fovie_ramp);
	//	STSAWGRunTriggerStop(&fovie_ramp, &fovie_ramp);
		STSAWGRun();
		int Trig_Point[SITE_NUM];
		SERIAL{
			Trig_Point[SITE] = (int)fovie_ramp.GetMeasResult(SITE, MIRET, TRIG_RESULT);
			if (((Trig_Point[SITE]) > 2) && ((Trig_Point[SITE]) < samples - 2)){
				//result[SITE] = start_point + (Trig_Point[SITE] - 2) * step;
				result[SITE] = fovie_ramp.GetMeasResult(SITE, MVRET, Trig_Point[SITE] );
			}
			else {
				result[SITE] = ERROR_RES;
			}
		}
		fovie_ramp.Set(FV, 0, v_range, i_range, FOVIe_RELAY_ON);
		fovie_ramp.Set(FV, 0, v_range, i_range, FOVIe_RELAY_OFF);

		return TRUE;
	}

	BOOL ramp(FOVIe fovie_ramp, FOVIe fovie_cap, double i_load, double start_point, double stop_point, double step, int interval, double trig_level, TRIG_MODE trig_mode, double *result)
	{
		if (interval < 10)	return FALSE;
		if (step == 0)	return FALSE;

		FOVIe_VRNG v_range = FOVIe_5V;
		FOVIe_IRNG i_range = FOVIe_100MA;
		if (fabs(start_point) < fabs(stop_point))
			v_range = get_fovie_v_range(stop_point);
		else
			v_range = get_fovie_v_range(start_point);

		FOVIe_IRNG iload_range = FOVIe_100MA;
		if (i_load < 1)
			iload_range = get_fovie_i_range(i_load);
		else
			return FALSE;

		int samples;
		double pat[MAX_SAMPLES];
		samples = int(fabs((stop_point - start_point) / step + 1));
		if ((samples <= 1) || (samples > MAX_SAMPLES)){
			samples = MAX_SAMPLES;
		}

		fovie_cap.Set(FI, i_load, FOVIe_10V, iload_range, FOVIe_RELAY_ON);

		STSAWGCreateRampData(&pat[0], samples, 1, start_point, stop_point);
		fovie_ramp.AwgClear();
		fovie_ramp.AwgLoader("awg", FV, v_range, i_range, pat, samples);
		fovie_ramp.AwgSelect("awg", 0, samples - 1, samples - 1, interval);
		fovie_cap.SetMeasVTrig(trig_level, trig_mode);

		fovie_ramp.Set(FV, start_point, v_range, i_range, FOVIe_RELAY_ON, 1);
		if (!START_DELAY)
			delay_ms(START_DELAY);
		fovie_ramp.MeasureVI(samples, interval, FOVIe_MI_X1, MEAS_AWG);
		fovie_cap.MeasureVI(samples, interval, FOVIe_MI_X1, MEAS_AWG);


		STSEnableAWG(&fovie_ramp, &fovie_cap);
		STSEnableMeas(&fovie_ramp, &fovie_cap);
		STSAWGRunTriggerStop(&fovie_cap, &fovie_ramp, &fovie_cap);

		int Trig_Point[SITE_NUM];
		SERIAL{
			Trig_Point[SITE] = (int)fovie_cap.GetMeasResult(SITE, MVRET, TRIG_RESULT);
			if (((Trig_Point[SITE]) > 2) && ((Trig_Point[SITE]) < samples - 2)){
				//result[SITE] = start_point + (Trig_Point[SITE] - 1) * step;
				result[SITE] = fovie_ramp.GetMeasResult(SITE, MVRET, Trig_Point[SITE] - 1);
			}
			else {
				result[SITE] = ERROR_RES;
			}
		}

		return TRUE;
	}

	BOOL ramp(FPVIe fpvie_ramp, FOVIe fovie_cap, FPVIe_VRNG v_range, FPVIe_IRNG i_range, VIMode vimode, string trig, double start_point, double stop_point, double step, int interval, double trig_level, TRIG_MODE trig_mode, double *result)
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
		fpvie_ramp.AwgClear();
		STSAWGCreateRampData(&pat[0], samples, 1, start_point, stop_point);
		fpvie_ramp.AwgLoader("awg", vimode, v_range, i_range, pat, samples);
		fpvie_ramp.AwgSelect("awg", 0, samples - 1, samples - 1, interval);
		if (trig == "VTrig")
		{
			fovie_cap.SetMeasVTrig(trig_level, trig_mode);
		}
		else if (trig == "ITrig")
		{
			fovie_cap.SetMeasITrig(trig_level, trig_mode);
		}


		fpvie_ramp.Set(vimode, start_point, v_range, i_range, FPVIe_RELAY_ON);
		if (!START_DELAY)
			delay_ms(START_DELAY);
		fpvie_ramp.MeasureVI(samples, interval, FPVIe_MV_X1, FPVIe_MI_X1, MEAS_AWG);
		fovie_cap.MeasureVI(samples, interval, FOVIe_MI_X1, MEAS_AWG);
		STSEnableAWG(&fpvie_ramp);
		STSEnableMeas(&fovie_cap, &fpvie_ramp);
		STSAWGRunTriggerStop(&fovie_cap, &fovie_cap, &fpvie_ramp);

		int Trig_Point[SITE_NUM];
		SERIAL{
			if (trig == "VTrig")
			{
				Trig_Point[SITE] = (int)fovie_cap.GetMeasResult(SITE, MIRET, TRIG_RESULT);
			}
			else if (trig == "ITrig")
			{
				Trig_Point[SITE] = (int)fovie_cap.GetMeasResult(SITE, MIRET, TRIG_RESULT);
			}
			if (((Trig_Point[SITE]) > 2) && ((Trig_Point[SITE]) < samples - 2)){
				result[SITE] = start_point + (Trig_Point[SITE] - 1) * step;
			}
			else
				result[SITE] = ERROR_RES;
		}

		fpvie_ramp.Set(FI, 0, v_range, i_range, FPVIe_RELAY_ON);
		fpvie_ramp.Set(FI, 0, v_range, i_range, FPVIe_RELAY_OFF);

		return TRUE;
	}

	BOOL ramp(FPVIe fpvie_ramp, ACM acm_cap, FPVIe_VRNG v_range, FPVIe_IRNG i_range, VIMode vimode, string trig, double start_point, double stop_point, double step, int interval, double trig_level, TRIG_MODE trig_mode, double *result)
	{
		if (interval < 10)	return FALSE;
		if (step == 0)	return FALSE;

		int samples;
		double pat[MAX_SAMPLES];
		samples = int(fabs((stop_point - start_point) / step + 1));
		if ((samples <= 1) || (samples > MAX_SAMPLES)){
			samples = MAX_SAMPLES;
		}

	 
		acm_cap.Set(FI, 0, ACM_N2P18V, ACM_5UA, ACM_RELAY_ON);  
		delay_ms(2);
		fpvie_ramp.AwgClear();
		STSAWGCreateRampData(&pat[0], samples, 1, start_point, stop_point);
		fpvie_ramp.AwgLoader("awg", vimode, v_range, i_range, pat, samples);
		fpvie_ramp.AwgSelect("awg", 0, samples - 1, samples - 1, interval);
		if (trig == "VTrig")
		{
			acm_cap.SetMeasVTrig(trig_level, trig_mode);
		}
		else if (trig == "ITrig")
		{
			acm_cap.SetMeasITrig(trig_level, trig_mode);
		}

		fpvie_ramp.Set(vimode, start_point, v_range, i_range, FPVIe_RELAY_ON);
		if (!START_DELAY)
			delay_ms(START_DELAY);
		fpvie_ramp.MeasureVI(samples, interval, FPVIe_MV_X1, FPVIe_MI_X1, MEAS_AWG);
		if (trig == "VTrig")
		{
			acm_cap.MeasureVI(ACM_MV, samples, interval, MEAS_AWG);
		}
		else if (trig == "ITrig")
		{
			acm_cap.MeasureVI(ACM_MI, samples, interval, MEAS_AWG);
		}
		STSEnableAWG(&fpvie_ramp);
		STSEnableMeas(&acm_cap, &fpvie_ramp);
		STSAWGRunTriggerStop(&acm_cap, &acm_cap, &fpvie_ramp);

		int Trig_Point[SITE_NUM];
		SERIAL{
			if (trig == "VTrig")
			{
				Trig_Point[SITE] = (int)acm_cap.GetMeasResult(SITE, TRIG_RESULT);
			}
			else if (trig == "ITrig")
			{
				Trig_Point[SITE] = (int)acm_cap.GetMeasResult(SITE, TRIG_RESULT);
			}
			if (((Trig_Point[SITE]) > 2) && ((Trig_Point[SITE]) < samples - 2)){
				result[SITE] = start_point + (Trig_Point[SITE] - 1) * step;
			}
			else
				result[SITE] = ERROR_RES;
		}

		fpvie_ramp.Set(FI, 0, v_range, i_range, FPVIe_RELAY_ON);
		fpvie_ramp.Set(FI, 0, v_range, i_range, FPVIe_RELAY_OFF);

		return TRUE;
	}


	BOOL ramp(FPVIe fpvie_ramp1, FPVIe fpvie_ramp2,ACM acm_cap, FPVIe_VRNG v_range, FPVIe_IRNG i_range, VIMode vimode, string trig, double start_point, double stop_point, double step, int interval, double trig_level, TRIG_MODE trig_mode, double *result)
	{
		if (interval < 10)	return FALSE;
		if (step == 0)	return FALSE;

		int samples;
		double pat[MAX_SAMPLES];
		samples = int(fabs((stop_point - start_point) / step + 1));
		if ((samples <= 1) || (samples > MAX_SAMPLES)){
			samples = MAX_SAMPLES;
		}


		acm_cap.Set(FI, 0, ACM_N2P18V, ACM_5UA, ACM_RELAY_ON);
		delay_ms(1);
		fpvie_ramp1.AwgClear();
		fpvie_ramp2.AwgClear();
		STSAWGCreateRampData(&pat[0], samples, 1, start_point, stop_point);
		fpvie_ramp1.AwgLoader("awg", vimode, v_range, i_range, pat, samples);
		fpvie_ramp2.AwgLoader("awg", vimode, v_range, i_range, pat, samples);
		fpvie_ramp1.AwgSelect("awg", 0, samples - 1, samples - 1, interval);
		fpvie_ramp2.AwgSelect("awg", 0, samples - 1, samples - 1, interval);
		if (trig == "VTrig")
		{
			acm_cap.SetMeasVTrig(trig_level, trig_mode);
		}
		else if (trig == "ITrig")
		{
			acm_cap.SetMeasITrig(trig_level, trig_mode);
		}

		fpvie_ramp1.Set(vimode, start_point, v_range, i_range, FPVIe_RELAY_ON);
		fpvie_ramp2.Set(vimode, start_point, v_range, i_range, FPVIe_RELAY_ON);
		if (!START_DELAY)
			delay_ms(START_DELAY);
		fpvie_ramp1.MeasureVI(samples, interval, FPVIe_MV_X1, FPVIe_MI_X1, MEAS_AWG);
		fpvie_ramp2.MeasureVI(samples, interval, FPVIe_MV_X1, FPVIe_MI_X1, MEAS_AWG);
		if (trig == "VTrig")
		{
			acm_cap.MeasureVI(ACM_MV, samples, interval, MEAS_AWG);
		}
		else if (trig == "ITrig")
		{
			acm_cap.MeasureVI(ACM_MI, samples, interval, MEAS_AWG);
		}
		STSEnableAWG(&fpvie_ramp1, &fpvie_ramp2);
		STSEnableMeas(&acm_cap, &fpvie_ramp1, &fpvie_ramp2);
		STSAWGRunTriggerStop(&acm_cap, &acm_cap, &fpvie_ramp1, &fpvie_ramp2);

		int Trig_Point[SITE_NUM];
		SERIAL{
			if (trig == "VTrig")
			{
				Trig_Point[SITE] = (int)acm_cap.GetMeasResult(SITE, TRIG_RESULT);
			}
			else if (trig == "ITrig")
			{
				Trig_Point[SITE] = (int)acm_cap.GetMeasResult(SITE, TRIG_RESULT);
			}
			if (((Trig_Point[SITE]) > 2) && ((Trig_Point[SITE]) < samples - 2)){
				result[SITE] = (start_point + (Trig_Point[SITE] - 1) * step)*2;
			}
			else
				result[SITE] = ERROR_RES;
		}

		fpvie_ramp1.Set(FI, 0, v_range, i_range, FPVIe_RELAY_ON);
		fpvie_ramp2.Set(FI, 0, v_range, i_range, FPVIe_RELAY_ON);
		fpvie_ramp1.Set(FI, 0, v_range, i_range, FPVIe_RELAY_OFF);
		fpvie_ramp2.Set(FI, 0, v_range, i_range, FPVIe_RELAY_OFF);
		return TRUE;
	}



	BOOL rampuc(FPVIe fpvie_ramp1, FPVIe fpvie_ramp2, ACM acm_cap, FPVIe_VRNG v_range, FPVIe_IRNG i_range, VIMode vimode, string trig, double start_point, double stop_point, double step, int interval, double trig_level, TRIG_MODE trig_mode, double *result)
	{
		if (interval < 10)	return FALSE;
		if (step == 0)	return FALSE;

		int samples;
		double pat[MAX_SAMPLES];
		samples = int(fabs((stop_point - start_point) / step + 1));
		if ((samples <= 1) || (samples > MAX_SAMPLES)){
			samples = MAX_SAMPLES;
		}


		acm_cap.Set(FI, 0, ACM_N2P18V, ACM_5UA, ACM_RELAY_ON);
		delay_ms(1);
		fpvie_ramp1.AwgClear();
		fpvie_ramp2.AwgClear();
		STSAWGCreateRampData(&pat[0], samples, 1, start_point, stop_point);
		fpvie_ramp1.AwgLoader("awg", vimode, v_range, i_range, pat, samples);
		fpvie_ramp2.AwgLoader("awg", vimode, v_range, i_range, pat, samples);
		fpvie_ramp1.AwgSelect("awg", 0, samples - 1, samples - 1, interval);
		fpvie_ramp2.AwgSelect("awg", 0, samples - 1, samples - 1, interval);
		if (trig == "VTrig")
		{
			acm_cap.SetMeasVTrig(trig_level, trig_mode);
		}
		else if (trig == "ITrig")
		{
			acm_cap.SetMeasITrig(trig_level, trig_mode);
		}

		fpvie_ramp1.Set(vimode, start_point, v_range, i_range, FPVIe_RELAY_ON);
		fpvie_ramp2.Set(vimode, start_point, v_range, i_range, FPVIe_RELAY_ON);
		if (!START_DELAY)
			delay_ms(START_DELAY);
		fpvie_ramp1.MeasureVI(samples, interval, FPVIe_MV_X1, FPVIe_MI_X1, MEAS_AWG);
		fpvie_ramp2.MeasureVI(samples, interval, FPVIe_MV_X1, FPVIe_MI_X1, MEAS_AWG);
		if (trig == "VTrig")
		{
			acm_cap.MeasureVI(ACM_MV, samples, interval, MEAS_AWG);
		}
		else if (trig == "ITrig")
		{
			acm_cap.MeasureVI(ACM_MI, samples, interval, MEAS_AWG);
		}
		STSEnableAWG(&fpvie_ramp1, &fpvie_ramp2);
		STSEnableMeas(&acm_cap, &fpvie_ramp1, &fpvie_ramp2);
		STSAWGRunTriggerStop(&acm_cap, &acm_cap, &fpvie_ramp1, &fpvie_ramp2);

		int Trig_Point[SITE_NUM];
		SERIAL{
			if (trig == "VTrig")
			{
				Trig_Point[SITE] = (int)acm_cap.GetMeasResult(SITE, TRIG_RESULT);
			}
			else if (trig == "ITrig")
			{
				Trig_Point[SITE] = (int)acm_cap.GetMeasResult(SITE, TRIG_RESULT);
			}
			if (((Trig_Point[SITE]) > 2) && ((Trig_Point[SITE]) < samples - 2)){
				result[SITE] = (start_point - (Trig_Point[SITE] + 1) * step) * 2;
			}
			else
				result[SITE] = ERROR_RES;
		}

		fpvie_ramp1.Set(FI, 0, v_range, i_range, FPVIe_RELAY_ON);
		fpvie_ramp2.Set(FI, 0, v_range, i_range, FPVIe_RELAY_ON);
		fpvie_ramp1.Set(FI, 0, v_range, i_range, FPVIe_RELAY_OFF);
		fpvie_ramp2.Set(FI, 0, v_range, i_range, FPVIe_RELAY_OFF);
		return TRUE;
	}


	BOOL ramp(FOVIe fovie_ramp, ACM acm_cap, FOVIe_VRNG v_range, FOVIe_IRNG i_range, VIMode vimode, string trig, double start_point, double stop_point, double step, int interval, double trig_level, TRIG_MODE trig_mode, double *result)
	{
		if (interval < 10)	return FALSE;
		if (step == 0)	return FALSE;

		int samples;
		double pat[MAX_SAMPLES];
		samples = int(fabs((stop_point - start_point) / step + 1));
		if ((samples <= 1) || (samples > MAX_SAMPLES)){
			samples = MAX_SAMPLES;
		}

		fovie_ramp.AwgClear();
		STSAWGCreateRampData(&pat[0], samples, 1, start_point, stop_point);
		fovie_ramp.AwgLoader("awg", vimode, v_range, i_range, pat, samples);
		fovie_ramp.AwgSelect("awg", 0, samples - 1, samples - 1, interval);
		if (trig == "VTrig")
		{
			acm_cap.SetMeasVTrig(trig_level, trig_mode);
		}
		else if (trig == "ITrig")
		{
			acm_cap.SetMeasITrig(trig_level, trig_mode);
		}

		fovie_ramp.Set(vimode, start_point, v_range, i_range, FOVIe_RELAY_ON);
		if (!START_DELAY)
			delay_ms(START_DELAY);
		fovie_ramp.MeasureVI(samples, interval,  FOVIe_MI_X1, MEAS_AWG);
		if (trig == "VTrig")
		{
			acm_cap.MeasureVI(ACM_MV, samples, interval, MEAS_AWG);
		}
		else if (trig == "ITrig")
		{
			acm_cap.MeasureVI(ACM_MI, samples, interval, MEAS_AWG);
		}
		STSEnableAWG(&fovie_ramp);
		STSEnableMeas(&acm_cap, &fovie_ramp);
		STSAWGRunTriggerStop(&acm_cap, &acm_cap, &fovie_ramp);

		int Trig_Point[SITE_NUM];
		SERIAL{
			if (trig == "VTrig")
			{
				Trig_Point[SITE] = (int)acm_cap.GetMeasResult(SITE, TRIG_RESULT);
			}
			else if (trig == "ITrig")
			{
				Trig_Point[SITE] = (int)acm_cap.GetMeasResult(SITE, TRIG_RESULT);
			}
			if (((Trig_Point[SITE]) > 2) && ((Trig_Point[SITE]) < samples - 2)){
				result[SITE] = start_point + (Trig_Point[SITE] - 1) * step;
			}
			else
				result[SITE] = ERROR_RES;
		}

		fovie_ramp.Set(FI, 0, v_range, i_range, FOVIe_RELAY_ON);
		fovie_ramp.Set(FI, 0, v_range, i_range, FOVIe_RELAY_OFF);

		return TRUE;
	}

	BOOL watch_burn(FOVIe fovie_res, FOVIe_VRNG v_range, FOVIe_IRNG i_range, double burn_v, bool enable = false){
		if (!enable)	 return FALSE;

		int interval = 10; // us
		int samples;
		double pat[MAX_SAMPLES];
		samples = MAX_SAMPLES;

		for (int i = 0; i < samples; ++i) pat[i] = burn_v;
		fovie_res.AwgClear();
		fovie_res.AwgLoader("awg", FV, v_range, i_range, pat, samples);
		fovie_res.AwgSelect("awg", 0, samples - 1, samples - 1, interval);

		fovie_res.Set(FV, burn_v, v_range, i_range, FOVIe_RELAY_ON);
		fovie_res.MeasureVI(samples, interval, FOVIe_MI_X1, MEAS_AWG);
	

		STSEnableAWG(&fovie_res);
		STSEnableMeas(&fovie_res);
		STSAWGRun();

		fovie_res.Set(FV, 0, v_range, i_range, FOVIe_RELAY_ON);

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
		//SERIAL	StsGetParam(funcindex, "OS_SOME_OPEN")->SetTestResult(SITE, 0, SOME_OPEN_FLAG[SITE]);
		//SERIAL	StsGetParam(funcindex, "OS_ALL_OPEN")->SetTestResult(SITE, 0, ALL_OPEN_FLAG[SITE]);
		//if (LEAK_NUM != 0)
		//{
		//	SERIAL	StsGetParam(funcindex, "OS_LEAK")->SetTestResult(SITE, 0, LEAK_FLAG[SITE]);
		//}

		return TRUE;
	}

	//***********************************************ADD BY Bill*****************************************************************************
	//***********************************************no trig stop*****************************************************************************
	//**********************************************one pin ramp another pin capture*********************************************************
	// FPVI ramp FPVI capture
	BOOL ramp(FPVIe vi_ramp, VIMode vimode, FPVIe_VRNG v_range, FPVIe_IRNG i_range, double start_point, double stop_point, double step, int interval, FPVIe vi_cap, const char* str_trig, TRIG_MODE trig_mode, double trig_level, BOOL result_type, double *result)
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
		vi_ramp.Set(vimode, start_point, v_range, i_range, FPVIe_RELAY_ON, 1);
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
		vi_ramp.MeasureVI(samples, interval, FPVIe_MV_X1, FPVIe_MI_X1, MEAS_AWG);
		vi_cap.MeasureVI(samples, interval, FPVIe_MV_X1, FPVIe_MI_X1, MEAS_AWG);

		STSEnableAWG(&vi_ramp);
		STSEnableMeas(&vi_cap, &vi_ramp);
		STSAWGRun();
		int Trig_Point[SITE_NUM];
		SERIAL{
			if (trig == "VTrig")
			{
				Trig_Point[SITE] = (int)vi_cap.GetMeasResult(SITE, MVRET, TRIG_RESULT);		// read the trigger point 
			}
			else if (trig == "ITrig")
			{
				Trig_Point[SITE] = (int)vi_cap.GetMeasResult(SITE, MIRET, TRIG_RESULT);		// read the trigger point 
			}

			if (Trig_Point[SITE] == 0)
			{
				Trig_Point[SITE] = 1;
			}
			if (((Trig_Point[SITE]) <= samples)){
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
					if (vimode == FI)
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
	BOOL ramp(FPVIe vi_ramp, VIMode vimode, FPVIe_VRNG v_range, FPVIe_IRNG i_range, double start_point, double stop_point, double step, int interval, FOVIe vi_cap, const char* str_trig, TRIG_MODE trig_mode, double trig_level, BOOL result_type, double *result)
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
		vi_ramp.Set(vimode, start_point, v_range, i_range, FPVIe_RELAY_ON, 1);
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
		vi_ramp.MeasureVI(samples, interval, FPVIe_MV_X1, FPVIe_MI_X1, MEAS_AWG);
		vi_cap.MeasureVI(samples, interval, FOVIe_MI_X1, MEAS_AWG);
		STSEnableAWG(&vi_ramp);
		STSEnableMeas(&vi_cap, &vi_ramp);
		STSAWGRun();
		int Trig_Point[SITE_NUM];
		SERIAL{
			if (trig == "ITrig")
			{
				Trig_Point[SITE] = (int)vi_cap.GetMeasResult(SITE, MIRET, TRIG_RESULT);
			}
			else if (trig == "VTrig")
			{
				Trig_Point[SITE] = (int)vi_cap.GetMeasResult(SITE, MVRET, TRIG_RESULT);
			}
			if (Trig_Point[SITE] == 0)
			{
				Trig_Point[SITE] = 1;
			}
			if (((Trig_Point[SITE]) <= samples)){
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
					if (vimode == FI)
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
	// FPVI ramp ACM capture
	BOOL ramp(FPVIe vi_ramp, VIMode vimode, FPVIe_VRNG v_range, FPVIe_IRNG i_range, double start_point, double stop_point, double step, int interval, ACM vi_cap, const char* str_trig, TRIG_MODE trig_mode, double trig_level, BOOL result_type, double *result)
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
		vi_ramp.Set(vimode, start_point, v_range, i_range, FPVIe_RELAY_ON, 1);
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
		vi_ramp.MeasureVI(samples, interval, FPVIe_MV_X1, FPVIe_MI_X1, MEAS_AWG);
		if (trig == "VTrig")
		{
			vi_cap.MeasureVI(ACM_MV, samples, interval, MEAS_AWG);
		}
		else if (trig == "ITrig")
		{
			vi_cap.MeasureVI(ACM_MI, samples, interval, MEAS_AWG);
		}
		STSEnableAWG(&vi_ramp);
		STSEnableMeas(&vi_cap, &vi_ramp);
		STSAWGRun();
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
						result[SITE] = start_point + (Trig_Point[SITE] - 1) * step;
					}
					else
					{
						result[SITE] = start_point - (Trig_Point[SITE] - 1) * step;
					}
				}
				else
				{
					if (vimode == FI)
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
	BOOL ramp(FOVIe vi_ramp, VIMode vimode, FOVIe_VRNG v_range, FOVIe_IRNG i_range, double start_point, double stop_point, double step, int interval, FOVIe vi_cap, const char* str_trig, TRIG_MODE trig_mode, double trig_level, BOOL result_type, double *result)
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
		vi_ramp.Set(vimode, start_point, v_range, i_range, FOVIe_RELAY_ON, 1);
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
		vi_ramp.MeasureVI(samples, interval, FOVIe_MI_X1, MEAS_AWG);
		vi_cap.MeasureVI(samples, interval, FOVIe_MI_X1, MEAS_AWG);
		STSEnableAWG(&vi_ramp);
		STSEnableMeas(&vi_cap, &vi_ramp);
		STSAWGRun();
		int Trig_Point[SITE_NUM];
		SERIAL{
			if (trig == "VTrig")
			{
				Trig_Point[SITE] = (int)vi_cap.GetMeasResult(SITE, MVRET, TRIG_RESULT);
			}
			if (trig == "ITrig")
			{
				Trig_Point[SITE] = (int)vi_cap.GetMeasResult(SITE, MIRET, TRIG_RESULT);
			}
			if (Trig_Point[SITE] == 0)
			{
				Trig_Point[SITE] = 1;
			}
			if (((Trig_Point[SITE]) <= samples)){
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
					if (vimode == FI)
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
	BOOL ramp(FOVIe vi_ramp, VIMode vimode, FOVIe_VRNG v_range, FOVIe_IRNG i_range, double start_point, double stop_point, double step, int interval, FPVIe vi_cap, const char* str_trig, TRIG_MODE trig_mode, double trig_level, BOOL result_type, double *result)
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
		vi_ramp.Set(vimode, start_point, v_range, i_range, FOVIe_RELAY_ON, 1);
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
		vi_ramp.MeasureVI(samples, interval, FOVIe_MI_X1, MEAS_AWG);
		vi_cap.MeasureVI(samples, interval, FPVIe_MV_X1, FPVIe_MI_X1,MEAS_AWG);
		STSEnableAWG(&vi_ramp);
		STSEnableMeas(&vi_cap, &vi_ramp);
		STSAWGRun();
		int Trig_Point[SITE_NUM];
		SERIAL{
			if (trig == "VTrig")
			{
				Trig_Point[SITE] = (int)vi_cap.GetMeasResult(SITE, MVRET, TRIG_RESULT);
			}
			else if (trig == "ITrig")
			{
				Trig_Point[SITE] = (int)vi_cap.GetMeasResult(SITE, MIRET, TRIG_RESULT);
			}
			if (Trig_Point[SITE] == 0)
			{
				Trig_Point[SITE] = 1;
			}
			if (((Trig_Point[SITE]) <= samples)){
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
					if (vimode == FI)
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
	// FOVI ramp ACM capture
	BOOL ramp(FOVIe vi_ramp, VIMode vimode, FOVIe_VRNG v_range, FOVIe_IRNG i_range, double start_point, double stop_point, double step, int interval, ACM vi_cap, const char* str_trig, TRIG_MODE trig_mode, double trig_level, BOOL result_type, double *result)
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
		vi_ramp.Set(vimode, start_point, v_range, i_range, FOVIe_RELAY_ON, 1);
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
		vi_ramp.MeasureVI(samples, interval, FOVIe_MI_X1, MEAS_AWG);
		if (trig == "VTrig")
		{
			vi_cap.MeasureVI(ACM_MV, samples, interval, MEAS_AWG);
		}
		else if (trig == "ITrig")
		{
			vi_cap.MeasureVI(ACM_MI, samples, interval, MEAS_AWG);
		}
		STSEnableAWG(&vi_ramp);
		STSEnableMeas(&vi_cap, &vi_ramp);
		STSAWGRun();
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
						result[SITE] = start_point + (Trig_Point[SITE] - 1) * step;
					}
					else
					{
						result[SITE] = start_point - (Trig_Point[SITE] - 1) * step;
					}
				}
				else
				{
					if (vimode == FI)
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
	BOOL ramp(FOVIe vi_ramp, VIMode vimode, FOVIe_VRNG v_range, FOVIe_IRNG i_range, double start_point, double stop_point, double step, int interval, const char* str_trig, TRIG_MODE trig_mode, double trig_level, BOOL result_type, double *result)
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
		vi_ramp.Set(vimode, start_point, v_range, i_range, FOVIe_RELAY_ON, 1);
		vi_ramp.AwgClear();
		vi_ramp.AwgLoader("awg", FV, v_range, i_range, pat, samples);
		vi_ramp.AwgSelect("awg", 0, samples - 1, samples - 1, interval);
		if (!START_DELAY)
			delay_ms(START_DELAY);
		vi_ramp.SetMeasITrig(trig_level, trig_mode);
		vi_ramp.MeasureVI(samples, interval, FOVIe_MI_X1, MEAS_AWG);
		STSEnableAWG(&vi_ramp);
		STSEnableMeas(&vi_ramp);
		STSAWGRun();
		int Trig_Point[SITE_NUM];
		SERIAL{
			Trig_Point[SITE] = (int)vi_ramp.GetMeasResult(SITE, MIRET, TRIG_RESULT);
			if (Trig_Point[SITE] == 0)
			{
				Trig_Point[SITE] = 1;
			}
			if (((Trig_Point[SITE]) <= samples)){
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
					if (vimode == FI)
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
	BOOL ramp(FPVIe vi_ramp, VIMode vimode, FPVIe_VRNG v_range, FPVIe_IRNG i_range, double start_point, double stop_point, double step, int interval, const char* str_trig, TRIG_MODE trig_mode, double trig_level, BOOL result_type, double *result)
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
		vi_ramp.Set(vimode, start_point, v_range, i_range, FPVIe_RELAY_ON, 1);
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
		vi_ramp.MeasureVI(samples, interval, FPVIe_MV_X1, FPVIe_MI_X1, MEAS_AWG);
		STSEnableAWG(&vi_ramp);
		STSEnableMeas(&vi_ramp);
		STSAWGRun();
		int Trig_Point[SITE_NUM];
		SERIAL{
			Trig_Point[SITE] = (int)vi_ramp.GetMeasResult(SITE, MIRET, TRIG_RESULT);
			if (Trig_Point[SITE] == 0)
			{
				Trig_Point[SITE] = 1;
			}
			if (((Trig_Point[SITE]) <= samples)){
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
					if (vimode == FI)
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
	// ACM ramp and capture 
	BOOL ramp(ACM vi_ramp, VIMode vimode, ACM_VRNG v_range, ACM_IRNG i_range, double start_point, double stop_point, double step, int interval, const char* str_trig, TRIG_MODE trig_mode, double trig_level, BOOL result_type, double *result)
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
		vi_ramp.Set(vimode, start_point, v_range, i_range, ACM_RELAY_ON, 1);
		vi_ramp.AwgClear();
		vi_ramp.AwgLoader("awg", FV, v_range, i_range, pat, samples);
		vi_ramp.AwgSelect("awg", 0, samples - 1, samples - 1, interval);
		if (trig == "VTrig")
		{
			vi_ramp.SetMeasVTrig(trig_level, trig_mode);	
		}
		else if (trig == "ITrig")
		{
			vi_ramp.SetMeasITrig(trig_level, trig_mode);
		}	
		if (!START_DELAY)
			delay_ms(START_DELAY);
		if (trig == "VTrig")
		{
			vi_ramp.MeasureVI(ACM_MV, samples, interval, MEAS_AWG);
		}
		else if (trig == "ITrig")
		{
			vi_ramp.MeasureVI(ACM_MI, samples, interval, MEAS_AWG);

		}
		STSEnableAWG(&vi_ramp);
		STSEnableMeas(&vi_ramp);
		STSAWGRun();
		int Trig_Point[SITE_NUM];
		SERIAL{
		
			Trig_Point[SITE] = (int)vi_ramp.GetMeasResult(SITE,  TRIG_RESULT);
	
			if (Trig_Point[SITE] == 0)
			{
				Trig_Point[SITE] = 1;
			}
			if (((Trig_Point[SITE]) <= samples)){
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
					if (vimode == FI)
					{
						result[SITE] = vi_ramp.GetMeasResult(SITE, Trig_Point[SITE] - 1);
					}
					else
					{
						result[SITE] = vi_ramp.GetMeasResult(SITE, Trig_Point[SITE] - 1);
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
	BOOL ramp(FPVIe vi_ramp, VIMode vimode, FPVIe_VRNG v_range, FPVIe_IRNG i_range, double start_point, double stop_point, double step, int interval, FPVIe vi_cap, const char* str_trig, const char* str_trigstop, int stop_sample, TRIG_MODE trig_mode, double trig_level, BOOL result_type, double *result)
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
		vi_ramp.Set(vimode, start_point, v_range, i_range, FPVIe_RELAY_ON, 1);
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
		vi_ramp.MeasureVI(samples, interval, FPVIe_MV_X1, FPVIe_MI_X1,MEAS_AWG);
		vi_cap.MeasureVI(samples, interval, FPVIe_MV_X1, FPVIe_MI_X1, MEAS_AWG);
		STSEnableAWG(&vi_ramp);
		STSEnableMeas(&vi_cap, &vi_ramp);
		STSAWGRunTriggerStop(&vi_cap, &vi_cap, &vi_ramp);
		int Trig_Point[SITE_NUM];
		SERIAL{
			if (trig == "VTrig")
			{
				Trig_Point[SITE] = (int)vi_cap.GetMeasResult(SITE, MVRET, TRIG_RESULT);
			}
			else if (trig == "ITrig")
			{
				Trig_Point[SITE] = (int)vi_cap.GetMeasResult(SITE, MIRET, TRIG_RESULT);
			}
			if (Trig_Point[SITE] == 0)
			{
				Trig_Point[SITE] = 1;
			}
			if (((Trig_Point[SITE]) <= samples)){
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
					if (vimode == FI)
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
	BOOL ramp(FPVIe vi_ramp, VIMode vimode, FPVIe_VRNG v_range, FPVIe_IRNG i_range, double start_point, double stop_point, double step, int interval, FOVIe vi_cap, const char* str_trig, const char* str_trigstop, INT stop_sample, TRIG_MODE trig_mode, double trig_level, BOOL result_type, double *result)
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
		vi_ramp.Set(vimode, start_point, v_range, i_range, FPVIe_RELAY_ON, 1);
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
		vi_ramp.MeasureVI(samples, interval, FPVIe_MV_X1, FPVIe_MI_X1, MEAS_AWG);
		vi_cap.MeasureVI(samples, interval, FOVIe_MI_X1, MEAS_AWG);
		STSEnableAWG(&vi_ramp);
		STSEnableMeas(&vi_cap, &vi_ramp);
		STSAWGRunTriggerStop(&vi_cap, &vi_cap, &vi_ramp);
		int Trig_Point[SITE_NUM];
		SERIAL{
			if (trig == "VTrig")
			{
				Trig_Point[SITE] = (int)vi_cap.GetMeasResult(SITE, MVRET, TRIG_RESULT);
			}
			if (trig == "ITrig")
			{
				Trig_Point[SITE] = (int)vi_cap.GetMeasResult(SITE, MIRET, TRIG_RESULT);
			}
			if (Trig_Point[SITE] == 0)
			{
				Trig_Point[SITE] = 1;
			}
			if (((Trig_Point[SITE]) <= samples)){
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
					if (vimode == FI)
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
	// FPVI ramp ACM capture
	BOOL ramp(FPVIe vi_ramp, VIMode vimode, FPVIe_VRNG v_range, FPVIe_IRNG i_range, double start_point, double stop_point, double step, int interval, ACM vi_cap, const char* str_trig, const char* str_trigstop, INT stop_sample, TRIG_MODE trig_mode, double trig_level, BOOL result_type, double *result)
	{
		string trig(str_trig);
		string trigstop(str_trigstop);
		if (interval < 10)	return FALSE;
		if (step == 0)	return FALSE;
		int samples;
		double pat[MAX_SAMPLES];
		samples = int(fabs((stop_point - start_point) / step + 1));
		if ((samples <= 1) || (samples > MAX_SAMPLES))
		{
			samples = MAX_SAMPLES;
		}
		if (stop_sample)
		{
			stop_sample = samples - 1;
		}
		vi_ramp.Set(vimode, start_point, v_range, i_range, FPVIe_RELAY_ON, 1);
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
		vi_ramp.MeasureVI(samples, interval, FPVIe_MV_X1, FPVIe_MI_X1, MEAS_AWG);
		if (trig == "VTrig")
		{
			vi_cap.MeasureVI(ACM_MV, samples, interval, MEAS_AWG);
		}
		else if (trig == "ITrig")
		{
			vi_cap.MeasureVI(ACM_MI, samples, interval, MEAS_AWG);
		}
		STSEnableAWG(&vi_ramp);
		STSEnableMeas(&vi_cap, &vi_ramp);
		STSAWGRunTriggerStop(&vi_cap, &vi_cap, &vi_ramp);
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
						result[SITE] = start_point + (Trig_Point[SITE] - 1) * step;
					}
					else
					{
						result[SITE] = start_point - (Trig_Point[SITE] - 1) * step;
					}
				}
				else
				{
					if (vimode == FI)
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
	BOOL ramp(FOVIe vi_ramp, VIMode vimode, FOVIe_VRNG v_range, FOVIe_IRNG i_range, double start_point, double stop_point, double step, int interval, FOVIe vi_cap, const char* str_trig, const char* str_trigstop, int stop_sample, TRIG_MODE trig_mode, double trig_level, BOOL result_type, double *result)
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
		vi_ramp.Set(vimode, start_point, v_range, i_range, FOVIe_RELAY_ON, 1);
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
		vi_ramp.MeasureVI(samples, interval, FOVIe_MI_X1, MEAS_AWG);
		vi_cap.MeasureVI(samples, interval, FOVIe_MI_X1, MEAS_AWG);
		STSEnableAWG(&vi_ramp);
		STSEnableMeas(&vi_cap, &vi_ramp);
		STSAWGRunTriggerStop(&vi_cap, &vi_cap, &vi_ramp);
		int Trig_Point[SITE_NUM];
		SERIAL{
			if (trig == "VTrig")
			{
				Trig_Point[SITE] = (int)vi_cap.GetMeasResult(SITE, MVRET, TRIG_RESULT);
			}
			if (trig == "ITrig")
			{
				Trig_Point[SITE] = (int)vi_cap.GetMeasResult(SITE, MIRET, TRIG_RESULT);
			}
			if (Trig_Point[SITE] == 0)
			{
				Trig_Point[SITE] = 1;
			}
			if (((Trig_Point[SITE]) <= samples)){
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
					if (vimode == FI)
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
	BOOL ramp(FOVIe vi_ramp, VIMode vimode, FOVIe_VRNG v_range, FOVIe_IRNG i_range, double start_point, double stop_point, double step, int interval, FPVIe vi_cap, const char* str_trig, const char* str_trigstop, int stop_sample, TRIG_MODE trig_mode, double trig_level, BOOL result_type, double *result)
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
		vi_ramp.Set(vimode, start_point, v_range, i_range, FOVIe_RELAY_ON, 1);
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
		vi_ramp.MeasureVI(samples, interval, FOVIe_MI_X1, MEAS_AWG);
		vi_cap.MeasureVI(samples, interval, FPVIe_MV_X1, FPVIe_MI_X1,MEAS_AWG);
		STSEnableAWG(&vi_ramp);
		STSEnableMeas(&vi_cap, &vi_ramp);
		STSAWGRunTriggerStop(&vi_cap, &vi_cap, &vi_ramp);
		int Trig_Point[SITE_NUM];
		SERIAL{
			if (trig == "VTrig")
			{
				Trig_Point[SITE] = (int)vi_cap.GetMeasResult(SITE, MVRET, TRIG_RESULT);
			}
			else if (trig == "ITrig")
			{
				Trig_Point[SITE] = (int)vi_cap.GetMeasResult(SITE, MIRET, TRIG_RESULT);
			}
			if (Trig_Point[SITE] == 0)
			{
				Trig_Point[SITE] = 1;
			}
			if (((Trig_Point[SITE]) <= samples)){
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
					if (vimode == FI)
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
	// FOVI ramp ACM capture
	BOOL ramp(FOVIe vi_ramp, VIMode vimode, FOVIe_VRNG v_range, FOVIe_IRNG i_range, double start_point, double stop_point, double step, int interval, ACM vi_cap, const char* str_trig, const char* str_trigstop, int stop_sample, TRIG_MODE trig_mode, double trig_level, BOOL result_type, double *result)
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
		vi_ramp.Set(vimode, start_point, v_range, i_range, FOVIe_RELAY_ON, 1);
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
		vi_ramp.MeasureVI(samples, interval, FOVIe_MI_X1, MEAS_AWG);
		if (trig == "VTrig")
		{
			vi_cap.MeasureVI(ACM_MV, samples, interval, MEAS_AWG);
		}
		if (trig == "ITrig")
		{
			vi_cap.MeasureVI(ACM_MI, samples, interval, MEAS_AWG);
		}
		STSEnableAWG(&vi_ramp);
		STSEnableMeas(&vi_cap, &vi_ramp);
		STSAWGRunTriggerStop(&vi_cap, &vi_cap, &vi_ramp);
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
						result[SITE] = start_point + (Trig_Point[SITE] - 1) * step;
					}
					else
					{
						result[SITE] = start_point - (Trig_Point[SITE] - 1) * step;
					}
				}
				else
				{
					if (vimode == FI)
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
	BOOL ramp(FOVIe vi_ramp, VIMode vimode, FOVIe_VRNG v_range, FOVIe_IRNG i_range, double start_point, double stop_point, double step, int interval, const char* str_trig, const char* str_trigstop, int stop_sample, TRIG_MODE trig_mode, double trig_level, BOOL result_type, double *result)
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
		vi_ramp.Set(vimode, start_point, v_range, i_range, FOVIe_RELAY_ON, 1);
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
		vi_ramp.MeasureVI(samples, interval, FOVIe_MI_X1,MEAS_AWG);
		STSEnableAWG(&vi_ramp);
		STSEnableMeas(&vi_ramp);
		STSAWGRunTriggerStop(&vi_ramp, &vi_ramp);
		int Trig_Point[SITE_NUM];
		SERIAL{
			Trig_Point[SITE] = (int)vi_ramp.GetMeasResult(SITE, MIRET, TRIG_RESULT);
			if (Trig_Point[SITE] == 0)
			{
				Trig_Point[SITE] = 1;
			}
			if (((Trig_Point[SITE]) <= samples)){
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
					if (vimode == FI)
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
	BOOL ramp(FPVIe vi_ramp, VIMode vimode, FPVIe_VRNG v_range, FPVIe_IRNG i_range, double start_point, double stop_point, double step, int interval, const char* str_trig, const char* str_trigstop, int stop_sample, TRIG_MODE trig_mode, double trig_level, BOOL result_type, double *result)
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
		vi_ramp.Set(vimode, start_point, v_range, i_range, FPVIe_RELAY_ON, 1);
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
		vi_ramp.MeasureVI(samples, interval, FPVIe_MV_X1, FPVIe_MI_X1, MEAS_AWG);
		STSEnableAWG(&vi_ramp);
		STSEnableMeas(&vi_ramp);
		STSAWGRunTriggerStop(&vi_ramp, &vi_ramp);
		int Trig_Point[SITE_NUM];
		SERIAL{
			Trig_Point[SITE] = (int)vi_ramp.GetMeasResult(SITE, MIRET, TRIG_RESULT);
			if (Trig_Point[SITE] == 0)
			{
				Trig_Point[SITE] = 1;
			}
			if (((Trig_Point[SITE]) <= samples)){
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
					if (vimode == FI)
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
	// ACM ramp and capture 
	BOOL ramp(ACM vi_ramp, VIMode vimode, ACM_VRNG v_range, ACM_IRNG i_range, double start_point, double stop_point, double step, int interval, const char* str_trig, const char* str_trigstop, int stop_sample, TRIG_MODE trig_mode, double trig_level, BOOL result_type, double *result)
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
		vi_ramp.Set(vimode, start_point, v_range, i_range, ACM_RELAY_ON, 1);
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
		vi_ramp.MeasureVI(ACM_MI,samples, interval, MEAS_AWG);
		STSEnableAWG(&vi_ramp);
		STSEnableMeas(&vi_ramp);
		STSAWGRunTriggerStop(&vi_ramp, &vi_ramp);
		int Trig_Point[SITE_NUM];
		SERIAL{
			Trig_Point[SITE] = (int)vi_ramp.GetMeasResult(SITE, TRIG_RESULT);
			if (Trig_Point[SITE] == 0)
			{
				Trig_Point[SITE] = 1;
			}
			if (((Trig_Point[SITE]) <= samples)){
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
					if (vimode == FI)
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
	BOOL ramp(FPVIe vi_ramp, VIMode vimode, FPVIe_VRNG v_range, FPVIe_IRNG i_range, double start_point, double stop_point, double step, int interval, FOVIe vi_cap, const char* str_trig, const char* str_trigstop, INT stop_sample, TRIG_MODE trig_mode, double trig_level, double *result)
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
		vi_ramp.Set(vimode, start_point, v_range, i_range, FPVIe_RELAY_ON, 1);
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
		vi_ramp.MeasureVI(samples, interval, FPVIe_MV_X1, FPVIe_MI_X1, MEAS_AWG);
		vi_cap.MeasureVI(samples, interval, FOVIe_MI_X1,MEAS_AWG);
		STSEnableAWG(&vi_ramp);
		STSEnableMeas(&vi_cap, &vi_ramp);
		STSAWGRunTriggerStop(&vi_cap, &vi_cap, &vi_ramp);
		int Trig_Point[SITE_NUM];
		double trig_result[SITE_NUM];
		SERIAL{
			if (trig == "VTrig")
			{
				Trig_Point[SITE] = (int)vi_cap.GetMeasResult(SITE, MVRET, TRIG_RESULT);
			}
			else if (trig == "ITrig")
			{
				Trig_Point[SITE] = (int)vi_cap.GetMeasResult(SITE, MIRET, TRIG_RESULT);
			}
		
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
			vi_ramp.Set(vimode, trig_result[SITE], v_range, i_range, FPVIe_RELAY_ON, 1);
			END_SINGLE_SITE()
		}
		delay_ms(1);
		qvm0.MeasureLADC(200, 5, QVMe_LADC_500MV, QVMe_LADC_40KHz, MEAS_AWG);//sample is 200;interval time is 5us 
		SERIAL result[SITE] = qvm0.GetMeasResult(SITE, AVERAGE_RESULT);

		return TRUE;
	}

	// dual FPVI ramp FOVI capture
	BOOL ramp(FPVIe vi_ramp, FPVIe vi_ramp1, VIMode vimode, FPVIe_VRNG v_range, FPVIe_IRNG i_range, double start_point, double stop_point, double step, int interval, FOVIe vi_cap, const char* str_trig, const char* str_trigstop, INT stop_sample, TRIG_MODE trig_mode, double trig_level, BOOL result_type, double *result)
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
		vi_ramp.Set(vimode, start_point, v_range, i_range, FPVIe_RELAY_ON, 1);
		vi_ramp1.Set(vimode, start_point, v_range, i_range, FPVIe_RELAY_ON, 1);
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
		vi_ramp.MeasureVI(samples, interval, FPVIe_MV_X1, FPVIe_MI_X1,MEAS_AWG);
		vi_ramp1.MeasureVI(samples, interval, FPVIe_MV_X1, FPVIe_MI_X1, MEAS_AWG);
		vi_cap.MeasureVI(samples, interval, FOVIe_MI_X1,MEAS_AWG);
		STSEnableAWG(&vi_ramp, &vi_ramp1);
		STSEnableMeas(&vi_cap, &vi_ramp, &vi_ramp1);
		STSAWGRunTriggerStop(&vi_cap, &vi_cap, &vi_ramp, &vi_ramp1);
		int Trig_Point[SITE_NUM];
		SERIAL{
			if (trig == "VTrig")
			{
				Trig_Point[SITE] = (int)vi_cap.GetMeasResult(SITE, MVRET, TRIG_RESULT);
			}
			else if (trig == "ITrig")
			{
				Trig_Point[SITE] = (int)vi_cap.GetMeasResult(SITE, MIRET, TRIG_RESULT);
			}
			if (Trig_Point[SITE] == 0)
			{
				Trig_Point[SITE] = 1;
			}
			if (((Trig_Point[SITE]) <= samples)){
				if (!result_type)
				{
					if (start_point < stop_point)
					{
						result[SITE] = (start_point + (Trig_Point[SITE] - 1) * step) * 2;
					}
					else
					{
						result[SITE] = (start_point - (Trig_Point[SITE] - 1) * step) * 2;
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
	BOOL ramp(FPVIe vi_ramp, FPVIe vi_ramp1, FPVIe vi_ramp2, FPVIe vi_ramp3, VIMode vimode, FPVIe_VRNG v_range, FPVIe_IRNG i_range, double start_point, double stop_point, double step, int interval, FOVIe vi_cap, const char* str_trig, const char* str_trigstop, INT stop_sample, TRIG_MODE trig_mode, double trig_level, BOOL result_type, double *result)
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
		vi_ramp.Set(vimode, start_point, v_range, i_range, FPVIe_RELAY_ON, 1);
		vi_ramp1.Set(vimode, start_point, v_range, i_range, FPVIe_RELAY_ON, 1);
		vi_ramp2.Set(vimode, start_point, v_range, i_range, FPVIe_RELAY_ON, 1);
		vi_ramp3.Set(vimode, start_point, v_range, i_range, FPVIe_RELAY_ON, 1);
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
		vi_ramp.MeasureVI(samples, interval, FPVIe_MV_X1, FPVIe_MI_X1, MEAS_AWG);
		vi_ramp1.MeasureVI(samples, interval, FPVIe_MV_X1, FPVIe_MI_X1, MEAS_AWG);
		vi_ramp2.MeasureVI(samples, interval, FPVIe_MV_X1, FPVIe_MI_X1, MEAS_AWG);
		vi_ramp3.MeasureVI(samples, interval, FPVIe_MV_X1, FPVIe_MI_X1, MEAS_AWG);
		vi_cap.MeasureVI(samples, interval, FOVIe_MI_X1,MEAS_AWG);
		STSEnableAWG(&vi_ramp, &vi_ramp1, &vi_ramp2, &vi_ramp3);
		STSEnableMeas(&vi_cap, &vi_ramp, &vi_ramp1, &vi_ramp2, &vi_ramp3);
		STSAWGRunTriggerStop(&vi_cap, &vi_cap, &vi_ramp, &vi_ramp1, &vi_ramp2, &vi_ramp3);
		//STSAWGRun();
		int Trig_Point[SITE_NUM];
		SERIAL{
			if (trig == "VTrig")
			{
				Trig_Point[SITE] = (int)vi_cap.GetMeasResult(SITE, MVRET, TRIG_RESULT);
			}
			else if (trig == "ITrig")
			{
				Trig_Point[SITE] = (int)vi_cap.GetMeasResult(SITE, MIRET, TRIG_RESULT);
			}
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
	// ACM ramp ACM capture


};